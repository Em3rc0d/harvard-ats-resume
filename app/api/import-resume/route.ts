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
  aiProviderFailureHttpStatus,
  aiProviderFailureMessage,
  classifyAIProviderError,
  type AIProviderFailureView,
} from '@/lib/application/ai/AIProviderFailure';
import { OLLAMA_PROVIDER } from '@/lib/infrastructure/ai/OllamaStructuredClient';
import {
  getRateLimitHeaders,
  rateLimitPublicApiRequest,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RESUME_MULTIPART_REQUEST_BYTES = MAX_RESUME_FILE_BYTES + (1024 * 1024);
const RESUME_IMPORT_AI_PROVIDER = OLLAMA_PROVIDER;

type ImportFailure = {
  readonly status: number;
  readonly errorCode: string;
  readonly stage: 'VALIDATION' | 'DOCUMENT_TEXT' | 'AI_EXTRACTION' | 'SOURCE_RECONCILIATION' | 'RUNTIME';
  readonly canRetry: boolean;
  readonly error: string;
  readonly provider?: AIProviderFailureView;
};

function classifyImportFailure(error: unknown): ImportFailure {
  const message = error instanceof Error ? error.message : 'Resume import failed.';

  if (error instanceof ResumeImportTimeoutError) {
    const providerFailure = classifyAIProviderError(error, RESUME_IMPORT_AI_PROVIDER);
    return {
      status: 504,
      errorCode: 'RESUME_IMPORT_TIMEOUT',
      stage: 'AI_EXTRACTION',
      canRetry: providerFailure.retryable,
      error: aiProviderFailureMessage(providerFailure, 'resume import'),
      provider: providerFailure.toView(),
    };
  }

  if (
    message.includes('Unsupported resume file type') ||
    message.includes('extension and MIME type') ||
    message.includes('file is empty') ||
    message.includes('10 MB limit')
  ) {
    return {
      status: 422,
      errorCode: 'INVALID_RESUME_FILE',
      stage: 'VALIDATION',
      canRetry: true,
      error: message,
    };
  }

  if (message.includes('no usable machine-readable text')) {
    return {
      status: 422,
      errorCode: 'RESUME_TEXT_UNREADABLE',
      stage: 'DOCUMENT_TEXT',
      canRetry: true,
      error: 'This resume has no usable machine-readable text. Export a text-based PDF or upload a DOCX version.',
    };
  }

  if (message.includes('no usable source-backed candidate content')) {
    return {
      status: 422,
      errorCode: 'NO_SOURCE_BACKED_CANDIDATE_CONTENT',
      stage: 'SOURCE_RECONCILIATION',
      canRetry: true,
      error: 'CV Engine could read the document, but it could not safely link enough extracted candidate data back to the source. Try a DOCX/text-based PDF or enter the evidence manually.',
    };
  }

  if (message.includes('no usable candidate content')) {
    return {
      status: 422,
      errorCode: 'NO_CANDIDATE_CONTENT',
      stage: 'AI_EXTRACTION',
      canRetry: true,
      error: 'The document was readable, but no usable candidate information was extracted.',
    };
  }

  if (
    message.includes('Resume extraction value is not present') ||
    message.includes('Resume extraction evidence is not present') ||
    message.includes('Resume extraction is missing source evidence')
  ) {
    return {
      status: 422,
      errorCode: 'SOURCE_RECONCILIATION_REJECTED',
      stage: 'SOURCE_RECONCILIATION',
      canRetry: true,
      error: 'The parser proposed information that could not be safely reconciled with the source resume. Unsupported values were not accepted.',
    };
  }

  const providerFailure = classifyAIProviderError(error, RESUME_IMPORT_AI_PROVIDER);
  if (providerFailure.kind !== 'UNKNOWN_PROVIDER_FAILURE') {
    return {
      status: aiProviderFailureHttpStatus(providerFailure),
      errorCode: `AI_PROVIDER_${providerFailure.kind}`,
      stage: 'AI_EXTRACTION',
      canRetry: providerFailure.retryable,
      error: aiProviderFailureMessage(providerFailure, 'resume import'),
      provider: providerFailure.toView(),
    };
  }

  return {
    status: 502,
    errorCode: 'RESUME_IMPORT_RUNTIME_FAILURE',
    stage: 'RUNTIME',
    canRetry: true,
    error: 'CV Engine could not complete the trusted resume import. Please try again or continue with manual career evidence.',
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const requestBytes = Number(contentLength);
      if (Number.isFinite(requestBytes) && requestBytes > MAX_RESUME_MULTIPART_REQUEST_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: 'Resume upload request exceeds the allowed size.',
            errorCode: 'RESUME_REQUEST_TOO_LARGE',
            stage: 'VALIDATION',
            canRetry: true,
          },
          { status: 413, headers: { 'Cache-Control': 'no-store, max-age=0' } },
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
          errorCode: 'RESUME_IMPORT_RATE_LIMITED',
          stage: 'VALIDATION',
          canRetry: true,
          retryAfter: new Date(rateLimitResult.reset).toISOString(),
        },
        { status: 429, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: 'A resume file is required.',
          errorCode: 'RESUME_FILE_REQUIRED',
          stage: 'VALIDATION',
          canRetry: true,
        },
        { status: 400, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    if (file.size > MAX_RESUME_FILE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: 'Resume file exceeds the 10 MB limit.',
          errorCode: 'RESUME_FILE_TOO_LARGE',
          stage: 'VALIDATION',
          canRetry: true,
        },
        { status: 413, headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' } },
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
        headers: { ...rateLimitHeaders, 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  } catch (error) {
    const failure = classifyImportFailure(error);
    console.error('Resume import boundary failure', {
      errorCode: failure.errorCode,
      stage: failure.stage,
      providerKind: failure.provider?.kind,
      cause: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: failure.error,
        errorCode: failure.errorCode,
        stage: failure.stage,
        canRetry: failure.canRetry,
        ...(failure.provider ? { provider: failure.provider } : {}),
      },
      { status: failure.status, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
