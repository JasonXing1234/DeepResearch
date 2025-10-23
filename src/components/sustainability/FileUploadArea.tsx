'use client'

import { useState } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Check, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { SustainabilityProject } from '../SustainabilityDashboard';

interface FileUploadAreaProps {
  projectId: string;
  project: SustainabilityProject;
  onFileUploaded: () => void;
}

const FILE_TYPES = [
  {
    key: 'emissions',
    label: 'Emissions Report',
    description: 'Upload your emissions data report (JSON/TXT)',
    fileId: 'emissions_file_id',
  },
  {
    key: 'investments',
    label: 'Investments Report',
    description: 'Upload your investments report (JSON/TXT)',
    fileId: 'investments_file_id',
  },
  {
    key: 'machine_purchases',
    label: 'Machine Purchases Report',
    description: 'Upload your machine purchases report (JSON/TXT)',
    fileId: 'machine_purchases_file_id',
  },
  {
    key: 'pilot_projects',
    label: 'Pilot Projects Report',
    description: 'Upload your pilot projects report (JSON/TXT)',
    fileId: 'pilot_projects_file_id',
  },
  {
    key: 'project_environments',
    label: 'Project Environments Report',
    description: 'Upload your project environments report (JSON/TXT)',
    fileId: 'project_environments_file_id',
  },
];

export function FileUploadArea({
  projectId,
  project,
  onFileUploaded,
}: FileUploadAreaProps) {
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  const isFileUploaded = (fileId: keyof SustainabilityProject) => {
    return project[fileId] != null;
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    fileType: string
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type (should be text/plain, .txt, application/json, or .json)
    if (
      file.type !== 'text/plain' &&
      file.type !== 'application/json' &&
      !file.name.endsWith('.txt') &&
      !file.name.endsWith('.json')
    ) {
      toast.error('Please upload a TXT or JSON file');
      return;
    }

    try {
      setUploadingFile(fileType);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('fileType', fileType);

      const response = await fetch('/api/sustainability/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`${fileType} file uploaded successfully`);
        onFileUploaded();
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error uploading file');
    } finally {
      setUploadingFile(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FILE_TYPES.map((fileType) => {
          const isUploaded = isFileUploaded(
            fileType.fileId as keyof SustainabilityProject
          );

          return (
            <div
              key={fileType.key}
              className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
                isUploaded
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              <input
                type="file"
                accept=".txt,.json,text/plain,application/json"
                onChange={(e) => handleFileUpload(e, fileType.key)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploadingFile === fileType.key}
              />

              <div className="flex flex-col items-center justify-center">
                {isUploaded ? (
                  <>
                    <Check className="h-8 w-8 text-green-600 mb-2" />
                    <h3 className="font-semibold text-gray-900">
                      {fileType.label}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">Uploaded</p>
                  </>
                ) : (
                  <>
                    {uploadingFile === fileType.key ? (
                      <>
                        <Loader2 className="h-8 w-8 text-blue-600 mb-2 animate-spin" />
                        <p className="text-sm text-gray-700 font-medium">
                          Uploading...
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-gray-400 mb-2" />
                        <h3 className="font-semibold text-gray-900">
                          {fileType.label}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1 text-center">
                          {fileType.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Click to upload
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Upload Instructions</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Upload up to 5 JSON or TXT report files</li>
          <li>• Each report should contain company data (JSON arrays or text format)</li>
          <li>• After uploading all files, click "Run Analysis" to start processing</li>
          <li>
            • Results will be displayed in the Summary, Details, and Diagnostics tabs
          </li>
        </ul>
      </div>

      <div className="flex gap-2 text-sm text-gray-600">
        <FileText className="h-4 w-4 flex-shrink-0 mt-1" />
        <p>Supported formats: JSON and TXT files</p>
      </div>
    </div>
  );
}
