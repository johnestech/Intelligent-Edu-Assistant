import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, X, FileText, Image, File } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  onUpload: (files: any[]) => void;
}

export const FileUpload = ({ onUpload }: FileUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt',
    'image/*': '.jpg,.jpeg,.png,.gif,.webp'
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="h-4 w-4" />;
    } else if (fileType === 'application/pdf' || 
               fileType.includes('document') || 
               fileType.includes('presentation')) {
      return <FileText className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  const uploadFile = async (file: File) => {
    if (!user) throw new Error('User not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Save document metadata to database
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title: file.name,
        file_name: fileName,
        file_type: file.type,
        file_size: file.size,
        metadata: {
          original_name: file.name,
          storage_path: filePath
        }
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Process document content
    const { data: processResult, error: processError } = await supabase.functions.invoke('process-document', {
      body: { 
        documentId: document.id,
        filePath: filePath,
        fileName: file.name,
        fileType: file.type
      }
    });

    if (processError) {
      console.warn('Document processing failed:', processError);
      // Continue anyway - the file was uploaded successfully
    }

    return {
      id: document.id,
      name: file.name,
      type: file.type,
      size: file.size,
      path: filePath
    };
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const uploadedFiles = [];
      const totalFiles = files.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        
        // Validate file type
        const isValidType = Object.keys(acceptedTypes).some(type => {
          if (type === 'image/*') {
            return file.type.startsWith('image/');
          }
          return file.type === type;
        });

        if (!isValidType) {
          toast({
            title: 'Invalid file type',
            description: `${file.name} is not a supported file type`,
            variant: 'destructive',
          });
          continue;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: 'File too large',
            description: `${file.name} is larger than 10MB`,
            variant: 'destructive',
          });
          continue;
        }

        try {
          const uploadedFile = await uploadFile(file);
          uploadedFiles.push(uploadedFile);
          setUploadProgress(((i + 1) / totalFiles) * 100);
        } catch (error: any) {
          toast({
            title: 'Upload failed',
            description: `Failed to upload ${file.name}: ${error.message}`,
            variant: 'destructive',
          });
        }
      }

      if (uploadedFiles.length > 0) {
        onUpload(uploadedFiles);
        toast({
          title: 'Upload successful',
          description: `${uploadedFiles.length} file(s) uploaded successfully`,
        });
      }

    } catch (error: any) {
      toast({
        title: 'Upload error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={Object.values(acceptedTypes).join(',')}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
          
          {uploading ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <Upload className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-medium">Uploading files...</p>
                <Progress value={uploadProgress} className="mt-2" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Drop files here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports PDF, DOCX, PPTX, TXT, and images (max 10MB each)
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};