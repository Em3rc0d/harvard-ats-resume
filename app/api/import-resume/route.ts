import { NextRequest, NextResponse } from 'next/server';
import { importResumeWithProvenance } from '@/lib/application/import/ResumeImportService';
import {
  NativeResumeImportProvider,
  ResumeImportTimeoutError,
} from '@/lib/infrastructure/import/NativeResumeImportProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'A resume file is required.' },
        { status: 400 },
      );
    }

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
