import { useState, useRef } from 'react';
import { Upload, FileText, File, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import type { Class, ClassMaterial } from '../app/page';

type UploadMaterialsViewProps = {
  classes: Class[];
  onAddMaterial: (material: ClassMaterial) => void;
};

const ACCEPTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
};

export function UploadMaterialsView({ classes, onAddMaterial }: UploadMaterialsViewProps) {
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach((file) => {
      if (file.type in ACCEPTED_TYPES || file.name.match(/\.(pdf|pptx|docx|xlsx|ppt|doc|xls)$/i)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      toast.error(`Invalid file type(s): ${invalidFiles.join(', ')}`);
    }

    if (validFiles.length > 0) {
      setSelectedFiles([...selectedFiles, ...validFiles]);
      toast.success(`${validFiles.length} file(s) added`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const getFileType = (file: File): ClassMaterial['type'] => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') return 'pdf';
    if (extension === 'pptx' || extension === 'ppt') return 'pptx';
    if (extension === 'docx' || extension === 'doc') return 'docx';
    if (extension === 'xlsx' || extension === 'xls') return 'xlsx';
    return 'other';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
      case 'pptx':
      case 'docx':
      case 'xlsx':
        return FileText;
      default:
        return File;
    }
  };

  const handleUpload = async () => {
    if (!selectedClass) {
      toast.error('Please select a class first');
      return;
    }

    if (selectedFiles.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    // Upload each file to the API
    const uploadPromises = selectedFiles.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('class_id', selectedClass);
      formData.append('title', file.name.replace(/\.[^/.]+$/, '')); // Remove extension

      try {
        const response = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const result = await response.json();

        // Convert database document to ClassMaterial format for local state
        const material: ClassMaterial = {
          id: result.document.id,
          classId: selectedClass,
          name: result.document.title,
          type: getFileType(file),
          size: result.document.file_size_bytes,
          uploadDate: result.document.date_of_material,
          url: result.document.file_path,
        };

        onAddMaterial(material);
        return { success: true, file: file.name };
      } catch (error) {
        console.error('Upload error:', error);
        return { success: false, file: file.name, error };
      }
    });

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    if (successCount > 0) {
      toast.success(`${successCount} file(s) uploaded successfully`);
    }

    if (failureCount > 0) {
      const failedFiles = results.filter(r => !r.success).map(r => r.file).join(', ');
      toast.error(`Failed to upload: ${failedFiles}`);
    }

    setSelectedFiles([]);
    setSelectedClass('');
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <Card className="w-full max-w-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="mb-2">Upload Class Materials</h1>
          <p className="text-gray-500">
            Upload PDFs, presentations, documents, and spreadsheets for your classes
          </p>
        </div>

        <div className="space-y-6">
          {/* Class Selection */}
          <div className="space-y-2">
            <Label htmlFor="class-select">Class</Label>
            <Select
              value={selectedClass}
              onValueChange={setSelectedClass}
            >
              <SelectTrigger id="class-select">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cls.color }}
                      />
                      {cls.code} - {cls.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="mb-2">
              Drag and drop files here, or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-sm text-gray-500">
              Supports PDF, PPTX, DOCX, XLSX
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.pptx,.ppt,.docx,.doc,.xlsx,.xls"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <Label>Selected Files ({selectedFiles.length})</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedFiles.map((file, index) => {
                  const Icon = getFileIcon(getFileType(file));
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Icon className="w-5 h-5 text-gray-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => removeFile(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            className="w-full"
            size="lg"
            disabled={!selectedClass || selectedFiles.length === 0}
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload {selectedFiles.length > 0 && `${selectedFiles.length} File(s)`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
