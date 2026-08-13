import { NextRequest, NextResponse } from 'next/server';
import {
  importResumeWithProvenance,
  MAX_RESUME_FILE_BYTES,
  validateResumeFileSize,
} from '@/lib/application/import/ResumeImportService';
import {
  NativeResumeImportProvider,
  ResumeImportTimeoutError,
} from '@/lib/infrastructure/import/NativeResumeImportProvider';
import {
  getRateLimitHeaders,
  rateLimitPublicApiRequest,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Multipart framing is small, but the request-level guard needs some allowance
// beyond the exact 10 MB file limit. Exact file.size is validated after parsing
// and before arrayBuffer() allocates a second copy of the upload.
const MAX_RESUME_MULTIPART_REQUEST_BYTES = MAX_RESUME_FILE_BYTES + (1024 * 1024);

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const requestBytes = Number(contentLength);
      if (Number.isFinite(requestBytes) && requestBytes > MAX_RESUME_MULTIPART_REQUEST_BYTES) {
        return NextResponse.json(
          { success: false, error: 'Resume upload request exceeds the allowed size.' },
          {
            status: 413,
            headers: { 'Cache-Control': 'no-store, max-age=0' },
          },
        );
      }
    }

    const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'import-resume');
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try the resume import again later.',
          retryAfter: new Date(rateLimitResult.reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'A resume file is required.' },
        {
          status: 400,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }

    if (file.size > MAX_RESUME_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Resume file exceeds the 10 MB limit.' },
        {
          status: 413,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }
    validateResumeFileSize(file.size);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const provider = new NativeResumeImportProvider();
    const imported = await importResumeWithProvenance(provider, {
      originalFileName: file.name,
      suppliedMimeType: file.type,
      bytes,
    });

    return NextResponse.json(
      { success: true, data: imported },
      {
        status: 200,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Resume import error:', error);

    const message = error instanceof Error ? error.message : 'Resume import failed.';
    const isTimeout = error instanceof ResumeImportTimeoutError;
    const isClientError =
      message.includes('Unsupported resume file type') ||
      message.includes('extension and MIME type') ||
      message.includes('file is empty') ||
      message.includes('10 MB limit') ||
      message.includes('no usable candidate content') ||
      message.includes('no usable machine-readable text');

    const status = isTimeout ? 504 : isClientError ? 422 : 502;
    const responseError = isTimeout
      ? 'Resume extraction timed out while waiting for the AI parser. Please try again.'
      : isClientError
        ? message
        : 'Failed to extract information from the resume. Please try again or fill it manually.';

    return NextResponse.json(
      {
        success: false,
        error: responseError,
      },
      {
        status,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
