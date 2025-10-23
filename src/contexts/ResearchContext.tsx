'use client'

import React, { createContext, useContext, useState } from 'react';

export interface ResearchDataset {
  emissions?: Record<string, any>[];
  investments?: Record<string, any>[];
  purchases?: Record<string, any>[];
  pilots?: Record<string, any>[];
  environments?: Record<string, any>[];
}

export interface ResearchQuery {
  id: string;
  companies: string[];
  status: 'idle' | 'researching' | 'completed' | 'failed';
  created_at: string;
  datasets?: ResearchDataset;
}

interface ResearchContextType {
  queries: ResearchQuery[];
  addQuery: (query: ResearchQuery) => void;
  deleteQuery: (id: string) => void;
  getLatestQuery: () => ResearchQuery | null;
}

const ResearchContext = createContext<ResearchContextType | undefined>(undefined);

export function ResearchProvider({
  children,
  initialQueries = [],
}: {
  children: React.ReactNode;
  initialQueries?: ResearchQuery[];
}) {
  const [queries, setQueries] = useState<ResearchQuery[]>(initialQueries);

  const addQuery = (query: ResearchQuery) => {
    setQueries([query, ...queries]);
  };

  const deleteQuery = (id: string) => {
    setQueries(queries.filter((q) => q.id !== id));
  };

  const getLatestQuery = () => {
    return queries.length > 0 ? queries[0] : null;
  };

  return (
    <ResearchContext.Provider
      value={{
        queries,
        addQuery,
        deleteQuery,
        getLatestQuery,
      }}
    >
      {children}
    </ResearchContext.Provider>
  );
}

export function useResearch() {
  const context = useContext(ResearchContext);
  if (!context) {
    throw new Error('useResearch must be used within ResearchProvider');
  }
  return context;
}
