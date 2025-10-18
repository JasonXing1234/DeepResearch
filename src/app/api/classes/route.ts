import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const {
      name,
      class_code,
      description,
      semester_year,
      semester_term,
      instructor,
      class_time,
      location,
      color_code,
      user_id,
    } = body;

    // Validate required fields
    if (!name || !semester_year || !semester_term) {
      return NextResponse.json(
        { error: 'Missing required fields: name, semester_year, semester_term' },
        { status: 400 }
      );
    }

    // Validate semester_term
    const validTerms = ['Fall', 'Spring', 'Summer', 'Winter'];
    if (!validTerms.includes(semester_term)) {
      return NextResponse.json(
        { error: 'Invalid semester_term. Must be Fall, Spring, Summer, or Winter' },
        { status: 400 }
      );
    }

    // For now, use a default user_id if not provided
    // TODO: Replace with actual authenticated user ID
    const effectiveUserId = user_id || '00000000-0000-0000-0000-000000000000';

    // Find or create the semester
    const { data: existingSemester, error: semesterFindError } = await supabase
      .from('semesters')
      .select('id')
      .eq('user_id', effectiveUserId)
      .eq('year', parseInt(semester_year))
      .eq('term', semester_term)
      .single();

    let semesterId: string;

    if (existingSemester) {
      // Use existing semester
      semesterId = existingSemester.id;
    } else {
      // Create new semester
      const { data: newSemester, error: semesterCreateError } = await supabase
        .from('semesters')
        .insert({
          year: parseInt(semester_year),
          term: semester_term,
          user_id: effectiveUserId,
        })
        .select('id')
        .single();

      if (semesterCreateError || !newSemester) {
        console.error('Semester creation error:', semesterCreateError);
        return NextResponse.json(
          { error: 'Failed to create semester', details: semesterCreateError?.message },
          { status: 500 }
        );
      }

      semesterId = newSemester.id;
    }

    // Insert the class into Supabase
    const { data, error } = await supabase
      .from('classes')
      .insert({
        name,
        class_code,
        description,
        semester_id: semesterId,
        instructor,
        class_time,
        location,
        color_code,
        user_id: effectiveUserId,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to create class', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      class: data,
      message: 'Class created successfully',
    });
  } catch (error) {
    console.error('Error creating class:', error);
    return NextResponse.json(
      {
        error: 'Failed to create class',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');

    // For now, use a default user_id if not provided
    // TODO: Replace with actual authenticated user ID
    const effectiveUserId = user_id || '00000000-0000-0000-0000-000000000000';

    // Get all classes for the user
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('user_id', effectiveUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch classes', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      classes: data,
    });
  } catch (error) {
    console.error('Error fetching classes:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch classes',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
