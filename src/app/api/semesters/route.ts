import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { year, term, user_id } = body;

    // Validate required fields
    if (!year || !term) {
      return NextResponse.json(
        { error: 'Missing required fields: year, term' },
        { status: 400 }
      );
    }

    // Validate term
    const validTerms = ['Fall', 'Spring', 'Summer', 'Winter'];
    if (!validTerms.includes(term)) {
      return NextResponse.json(
        { error: 'Invalid term. Must be Fall, Spring, Summer, or Winter' },
        { status: 400 }
      );
    }

    // Validate year
    const yearInt = parseInt(year);
    if (isNaN(yearInt) || yearInt < 1900 || yearInt > 2100) {
      return NextResponse.json(
        { error: 'Invalid year. Must be between 1900 and 2100' },
        { status: 400 }
      );
    }

    // For now, use a default user_id if not provided
    // TODO: Replace with actual authenticated user ID
    const effectiveUserId = user_id || '00000000-0000-0000-0000-000000000000';

    // Check if semester already exists for this user
    const { data: existingSemester } = await supabase
      .from('semesters')
      .select('id')
      .eq('user_id', effectiveUserId)
      .eq('year', yearInt)
      .eq('term', term)
      .single();

    if (existingSemester) {
      return NextResponse.json(
        { error: 'This semester already exists' },
        { status: 409 }
      );
    }

    // Insert the semester into Supabase
    const { data, error } = await supabase
      .from('semesters')
      .insert({
        year: yearInt,
        term,
        user_id: effectiveUserId,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to create semester', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      semester: data,
      message: 'Semester created successfully',
    });
  } catch (error) {
    console.error('Error creating semester:', error);
    return NextResponse.json(
      {
        error: 'Failed to create semester',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');

    // For now, use a default user_id if not provided
    // TODO: Replace with actual authenticated user ID
    const effectiveUserId = user_id || '00000000-0000-0000-0000-000000000000';

    // Get all semesters for the user
    const { data, error } = await supabase
      .from('semesters')
      .select('*')
      .eq('user_id', effectiveUserId)
      .order('year', { ascending: false })
      .order('term', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch semesters', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      semesters: data,
    });
  } catch (error) {
    console.error('Error fetching semesters:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch semesters',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
