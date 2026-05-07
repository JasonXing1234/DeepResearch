import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    backendDisabled: true,
    message: 'Backend worker is disabled on this branch.',
  });
}

export async function POST() {
  return NextResponse.json({
    success: true,
    backendDisabled: true,
    message: 'Backend worker is disabled on this branch.',
  });
}
