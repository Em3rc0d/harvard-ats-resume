import { NextRequest, NextResponse } from 'next/server';
import { importResumeWithProvenance } from '@/lib/application/import/ResumeImportService';
import { N8nResumeImportProvider } from '@/lib/infrastructure/import/N8nResumeImportProvider';

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
    const provider = new N8nResumeImportProvider();
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
    const isClientError =
      message.includes('Unsupported resume file type') ||
      message.includes('extension and MIME type') ||
      message.includes('file is empty') ||
      message.includes('10 MB limit') ||
      message.includes('no usable candidate content');

    return NextResponse.json(
      {
        success: false,
        error: isClientError
          ? message
          : 'Failed to extract information from the resume. Please try again or fill it manually.',
      },
      {
        status: isClientError ? 422 : 502,
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
