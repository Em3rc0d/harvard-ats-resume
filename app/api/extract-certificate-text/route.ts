import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_RESUME_FILE_BYTES,
  validateResumeFileSize,
} from '@/lib/application/import/ResumeImportService';
import { extractResumeText } from '@/lib/infrastructure/import/NativeResumeImportProvider';
import {
  getRateLimitHeaders,
  rateLimitPublicApiRequest,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MULTIPART_REQUEST_BYTES = MAX_RESUME_FILE_BYTES + (1024 * 1024);

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const requestBytes = Number(contentLength);
      if (Number.isFinite(requestBytes) && requestBytes > MAX_MULTIPART_REQUEST_BYTES) {
        return NextResponse.json(
          { success: false, error: 'Certificate upload request exceeds the allowed size.' },
          { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
        );
      }
    }

    // Certificate extraction shares the bounded upload budget with resume import.
    const rateLimitResult = await rateLimitPublicApiRequest(request.headers, 'import-resume');
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try the certificate import again later.',
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
        { success: false, error: 'A certificate PDF is required.' },
        {
          status: 400,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: 'Only PDF certificates are accepted by this endpoint.' },
        {
          status: 422,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }

    validateResumeFileSize(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await extractResumeText({
      originalFileName: file.name,
      mimeType: 'application/pdf',
      byteSize: file.size,
      bytes,
    });
    const text = document.pages.map((page) => page.text).join('\n').replace(/\s+/g, ' ').trim();

    if (text.length < 20) {
      return NextResponse.json(
        {
          success: false,
          error: 'This certificate PDF has no usable machine-readable text. Upload an image or screenshot of the certificate instead.',
        },
        {
          status: 422,
          headers: {
            ...rateLimitHeaders,
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }

    return NextResponse.json(
      { success: true, text },
      {
        status: 200,
        headers: {
          ...rateLimitHeaders,
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('Certificate PDF extraction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to read the certificate PDF. Upload an image or screenshot instead.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
