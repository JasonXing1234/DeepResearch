-- First, create a mock semester
INSERT INTO semesters (id, user_id, year, term)
VALUES (
  '5bd1e767-9af2-4c33-b379-28ce117c081f',
  '00000000-0000-0000-0000-000000000000',
  2025,
  'Fall'
)
ON CONFLICT (id) DO NOTHING;

-- Then create the CS340 class
INSERT INTO classes (
  id,
  user_id,
  name,
  class_code,
  semester_id,
  instructor,
  color_code
) VALUES (
  '7fab586c-a9ff-4f1a-9ff2-0a285a8f9374',
  '00000000-0000-0000-0000-000000000000',
  'Database Systems',
  'CS340',
  '5bd1e767-9af2-4c33-b379-28ce117c081f',
  'Dr. Johnson',
  '#10b981'
)
ON CONFLICT (id) DO NOTHING;

-- Add mock lecture for CS340
INSERT INTO documents (
  user_id,
  class_id,
  title,
  is_lecture_notes,
  storage_bucket,
  file_path,
  original_filename,
  file_size_bytes,
  mime_type,
  date_of_material,
  upload_status,
  transcription_status,
  embedding_status,
  audio_duration_seconds,
  transcription_text,
  word_count
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '7fab586c-a9ff-4f1a-9ff2-0a285a8f9374',
  'Introduction to Databases',
  false,
  'class-materials',
  'lectures/cs340/intro-to-databases.mp3',
  'intro-to-databases.mp3',
  5242880,
  'audio/mpeg',
  '2025-10-18',
  'completed',
  'completed',
  'pending',
  3600,
  'Welcome to CS340, Introduction to Databases. Today we will cover the fundamentals of database systems and relational database design.

A database is an organized collection of structured information or data, typically stored electronically in a computer system. Database management systems, or DBMS, are software applications that interact with the user, applications, and the database itself to capture and analyze data.

The relational model, introduced by Edgar Codd in 1970, organizes data into tables with rows and columns. Each row represents a record, and each column represents an attribute of that record. Tables can be related to each other through keys, creating relationships between data.

We will discuss several key concepts today. First, primary keys uniquely identify each row in a table. Foreign keys establish relationships between tables by referencing the primary key of another table. This creates the foundation for relational database design.

Normalization is the process of organizing data to reduce redundancy and improve data integrity. We will cover the normal forms, including first normal form, second normal form, and third normal form. These rules help us design efficient database schemas.

SQL, or Structured Query Language, is the standard language for interacting with relational databases. We will learn how to write SELECT queries to retrieve data, INSERT statements to add new records, UPDATE statements to modify existing data, and DELETE statements to remove records.

Joins are a powerful feature that allow us to combine data from multiple tables. We will study inner joins, left joins, right joins, and full outer joins. Understanding when to use each type of join is crucial for effective database querying.

Indexes improve query performance by creating data structures that allow the database to find rows more quickly. However, indexes also have overhead, so we need to balance query performance with storage requirements and update performance.

Transactions ensure data consistency through ACID properties: Atomicity, Consistency, Isolation, and Durability. These properties guarantee that database operations are reliable even in the presence of failures or concurrent access.

For your homework, please read chapters 1 through 3 in your textbook and complete the practice exercises on database design. Next lecture, we will dive deeper into SQL queries and begin working with a real database system.',
  450
);

-- Add mock material (PDF) for CS340
INSERT INTO documents (
  user_id,
  class_id,
  title,
  is_lecture_notes,
  storage_bucket,
  file_path,
  original_filename,
  file_size_bytes,
  mime_type,
  date_of_material,
  upload_status,
  transcription_status,
  embedding_status
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '7fab586c-a9ff-4f1a-9ff2-0a285a8f9374',
  'Database Design Principles',
  false,
  'class-materials',
  'materials/cs340/database-design-principles.pdf',
  'database-design-principles.pdf',
  1245678,
  'application/pdf',
  '2025-10-18',
  'completed',
  'not_applicable',
  'pending'
);
