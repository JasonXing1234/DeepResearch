-- Seed data for local development and testing

-- Add a semester
INSERT INTO semesters (id, user_id, year, term)
VALUES 
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 2025, 'Fall')
ON CONFLICT (id) DO NOTHING;

-- Add some classes
INSERT INTO classes (id, user_id, semester_id, name, class_code, instructor, color_code)
VALUES 
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'Introduction to Computer Science', 'CS 101', 'Dr. Smith', '#3b82f6'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'Calculus I', 'MATH 151', 'Prof. Johnson', '#10b981'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'English Composition', 'ENG 102', 'Dr. Williams', '#f59e0b')
ON CONFLICT (id) DO NOTHING;
