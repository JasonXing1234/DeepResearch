'use client'

import { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { RecordingView } from '../components/RecordingView';
import { ClassView } from '../components/ClassView';
import { StudyAssistant } from '../components/StudyAssistant';
import { UploadMaterialsView } from '../components/UploadMaterialsView';
import { Toaster } from '../components/ui/sonner';
import { toast } from 'sonner';

export type Semester = {
  id: string;
  name: string;
  year: number;
  term: 'Fall' | 'Spring' | 'Summer' | 'Winter';
  isActive: boolean;
};

export type Class = {
  id: string;
  semesterId: string;
  name: string;
  code: string;
  color: string;
  professor: string;
};

export type Lecture = {
  id: string;
  classId: string;
  title: string;
  date: string;
  duration: number; // in seconds
  audioUrl: string;
  transcript: string;
};

export type ClassMaterial = {
  id: string;
  classId: string;
  name: string;
  type: 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'other';
  size: number; // in bytes
  uploadDate: string;
  url: string;
};

// Mock data
export const mockSemesters: Semester[] = [
  { id: '1', name: 'Fall 2025', year: 2025, term: 'Fall', isActive: true },
  { id: '2', name: 'Spring 2025', year: 2025, term: 'Spring', isActive: false },
];

export const mockClasses: Class[] = [
  { id: '1', semesterId: '1', name: 'Introduction to Computer Science', code: 'CS 101', color: '#3b82f6', professor: 'Dr. Smith' },
  { id: '2', semesterId: '1', name: 'Calculus I', code: 'MATH 151', color: '#10b981', professor: 'Prof. Johnson' },
  { id: '3', semesterId: '1', name: 'English Composition', code: 'ENG 102', color: '#f59e0b', professor: 'Dr. Williams' },
  { id: '4', semesterId: '2', name: 'Psychology 101', code: 'PSY 101', color: '#8b5cf6', professor: 'Dr. Davis' },
  { id: '5', semesterId: '2', name: 'Data Structures', code: 'CS 201', color: '#06b6d4', professor: 'Dr. Smith' },
];

export const mockMaterials: ClassMaterial[] = [
  {
    id: '1',
    classId: '1',
    name: 'Course Syllabus',
    type: 'pdf',
    size: 245678,
    uploadDate: '2025-10-01',
    url: '#',
  },
  {
    id: '2',
    classId: '1',
    name: 'Week 1 - Introduction to Programming',
    type: 'pptx',
    size: 1245678,
    uploadDate: '2025-10-08',
    url: '#',
  },
  {
    id: '3',
    classId: '1',
    name: 'Homework Assignment 1',
    type: 'pdf',
    size: 89012,
    uploadDate: '2025-10-10',
    url: '#',
  },
  {
    id: '4',
    classId: '2',
    name: 'Calculus Textbook Chapter 1',
    type: 'pdf',
    size: 3456789,
    uploadDate: '2025-10-05',
    url: '#',
  },
  {
    id: '5',
    classId: '2',
    name: 'Problem Set 1',
    type: 'pdf',
    size: 123456,
    uploadDate: '2025-10-12',
    url: '#',
  },
  {
    id: '6',
    classId: '3',
    name: 'Essay Writing Guidelines',
    type: 'docx',
    size: 456789,
    uploadDate: '2025-10-03',
    url: '#',
  },
];

export const mockLectures: Lecture[] = [
  {
    id: '1',
    classId: '1',
    title: 'Introduction to Programming',
    date: '2025-10-15',
    duration: 3240, // 54 minutes
    audioUrl: '#',
    transcript: `Welcome to Introduction to Computer Science. Today we'll be covering the fundamentals of programming and computational thinking.

Programming is the process of creating a set of instructions that tell a computer how to perform a task. Programming can be done using a variety of computer programming languages, such as JavaScript, Python, and C++.

Let's start with variables. A variable is a container for storing data values. In most programming languages, you need to declare a variable before you can use it. For example, in JavaScript, you might write: let x = 5;

This creates a variable called x and assigns it the value 5. Variables are fundamental to programming because they allow us to store and manipulate data.

Next, let's talk about data types. Common data types include numbers, strings (text), booleans (true/false), and more complex types like arrays and objects.

Control structures are another important concept. These include if statements, which allow you to execute code conditionally, and loops, which allow you to repeat code multiple times.

For your homework, I want you to practice writing simple programs that use variables, data types, and basic control structures. We'll build on these concepts in our next lecture.`,
  },
  {
    id: '2',
    classId: '1',
    title: 'Data Structures and Algorithms',
    date: '2025-10-17',
    duration: 3600, // 60 minutes
    audioUrl: '#',
    transcript: `Today's lecture focuses on data structures and algorithms, which are core concepts in computer science.

A data structure is a way of organizing and storing data so that it can be accessed and modified efficiently. Common data structures include arrays, linked lists, stacks, queues, trees, and graphs.

Let's start with arrays. An array is a collection of elements, each identified by an index. Arrays are useful when you need to store multiple values of the same type.

Linked lists are another fundamental data structure. Unlike arrays, linked lists consist of nodes, where each node contains data and a reference to the next node.

Now, let's talk about algorithms. An algorithm is a step-by-step procedure for solving a problem. The efficiency of an algorithm is often measured in terms of time complexity and space complexity.

Big O notation is used to describe the performance of an algorithm. For example, O(n) means the algorithm's time grows linearly with input size, while O(1) represents constant time.

We'll be implementing several sorting algorithms in the coming weeks, including bubble sort, merge sort, and quicksort.`,
  },
  {
    id: '3',
    classId: '2',
    title: 'Limits and Continuity',
    date: '2025-10-14',
    duration: 2880, // 48 minutes
    audioUrl: '#',
    transcript: `Welcome to today's lecture on limits and continuity. These are foundational concepts in calculus.

A limit describes the value that a function approaches as the input approaches some value. Limits are essential for defining derivatives and integrals.

The formal definition of a limit states: the limit of f(x) as x approaches a equals L if we can make f(x) arbitrarily close to L by making x sufficiently close to a.

Let's look at some examples. Consider the function f(x) = x². As x approaches 2, f(x) approaches 4. We write this as: lim(x→2) x² = 4.

Now, let's discuss continuity. A function is continuous at a point if the limit exists at that point and equals the function's value at that point.

More formally, f is continuous at x = a if: 1) f(a) is defined, 2) lim(x→a) f(x) exists, and 3) lim(x→a) f(x) = f(a).

Discontinuities can occur in several ways: removable discontinuities, jump discontinuities, and infinite discontinuities.

For your homework, work through problems 1-15 in section 2.3 of your textbook.`,
  },
  {
    id: '4',
    classId: '3',
    title: 'Essay Structure and Thesis Statements',
    date: '2025-10-16',
    duration: 2700, // 45 minutes
    audioUrl: '#',
    transcript: `Today we're going to discuss essay structure and how to write effective thesis statements.

A well-structured essay has three main parts: an introduction, body paragraphs, and a conclusion. Each part serves a specific purpose in communicating your argument.

The introduction should grab the reader's attention, provide context, and present your thesis statement. The thesis is the central argument or claim of your essay.

A strong thesis statement is specific, arguable, and focused. It should clearly state your position and give the reader a roadmap of your essay.

For example, instead of writing "Social media has effects on society," you might write "Social media has increased political polarization by creating echo chambers that reinforce existing beliefs."

Body paragraphs should each focus on a single point that supports your thesis. Start with a topic sentence, provide evidence, analyze that evidence, and connect it back to your thesis.

The conclusion should synthesize your arguments and reinforce your thesis without simply repeating what you've already said. It should leave the reader with something to think about.

Your first essay is due next week. Make sure to visit the writing center if you need help with your draft.`,
  },
  {
    id: '5',
    classId: '4',
    title: 'Introduction to Cognitive Psychology',
    date: '2025-05-13',
    duration: 3300, // 55 minutes
    audioUrl: '#',
    transcript: `Welcome to our lecture on cognitive psychology. This field examines internal mental processes such as perception, memory, thinking, and problem-solving.

Cognitive psychology emerged in the 1950s and 1960s as a reaction to behaviorism, which focused only on observable behavior. Cognitive psychologists argue that we must study mental processes to fully understand human behavior.

Let's start with perception. Perception is the process by which we organize and interpret sensory information. It's not just passive reception of stimuli, but an active process of construction.

The Gestalt principles of perception describe how we tend to organize visual elements into groups or unified wholes. These include principles like proximity, similarity, and closure.

Memory is another crucial topic in cognitive psychology. We distinguish between different types of memory: sensory memory, short-term or working memory, and long-term memory.

The information processing model compares the mind to a computer, with inputs, processing, storage, and outputs. While this model has limitations, it's been influential in cognitive psychology.

Attention is also a key concept. We have limited attentional resources, so we must select what to focus on. Selective attention and divided attention are important phenomena to understand.

Next week, we'll dive deeper into memory systems and discuss strategies for improving memory retention.`,
  },
];

export default function App() {
  const [currentView, setCurrentView] = useState<'record' | 'upload' | 'class' | 'study'>('class');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [materials, setMaterials] = useState<ClassMaterial[]>(mockMaterials);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch semesters and classes from API on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch semesters
        const semestersResponse = await fetch('/api/semesters');
        const semestersResult = await semestersResponse.json();

        // Fetch classes
        const classesResponse = await fetch('/api/classes');
        const classesResult = await classesResponse.json();

        if (semestersResult.success && semestersResult.semesters) {
          // Map database semesters to UI format
          const mappedSemesters = semestersResult.semesters.map((s: any) => ({
            id: s.id,
            name: `${s.term} ${s.year}`,
            year: s.year,
            term: s.term,
            isActive: false, // TODO: Determine active semester logic
          }));
          console.log('Loaded semesters:', mappedSemesters);
          setSemesters(mappedSemesters);
        }

        if (classesResult.success && classesResult.classes) {
          // Map database classes to UI format
          const mappedClasses = classesResult.classes.map((c: any) => ({
            id: c.id,
            semesterId: c.semester_id,
            name: c.name,
            code: c.class_code || '',
            color: c.color_code || '#3b82f6',
            professor: c.instructor || '',
          }));
          console.log('Loaded classes:', mappedClasses);
          setClasses(mappedClasses);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load semesters and classes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAddSemester = (semester: Semester) => {
    setSemesters([...semesters, semester]);
  };

  const handleAddClass = (cls: Class) => {
    setClasses([...classes, cls]);
  };

  const handleAddMaterial = (material: ClassMaterial) => {
    setMaterials([...materials, material]);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        semesters={semesters}
        classes={classes}
        currentView={currentView}
        onViewChange={setCurrentView}
        selectedClassId={selectedClassId}
        onClassSelect={setSelectedClassId}
        onAddSemester={handleAddSemester}
        onAddClass={handleAddClass}
      />
      
      <main className="flex-1 overflow-hidden">
        {currentView === 'study' && (
          <StudyAssistant classes={classes} lectures={mockLectures} />
        )}
        {currentView === 'record' && (
          <RecordingView classes={classes} />
        )}
        {currentView === 'upload' && (
          <UploadMaterialsView classes={classes} onAddMaterial={handleAddMaterial} />
        )}
        {currentView === 'class' && (
          <ClassView
            selectedClassId={selectedClassId}
            classes={classes}
            lectures={mockLectures}
            materials={materials}
          />
        )}
      </main>
      
      <Toaster />
    </div>
  );
}