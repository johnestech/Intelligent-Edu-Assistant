import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { documentId, filePath, fileName, fileType } = await req.json();

    console.log(`Processing document: ${fileName} (${fileType})`);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError) {
      console.error('Download error:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    let extractedText = '';

    try {
      // For now, we'll handle basic text extraction
      // In production, you'd want to add proper document processing libraries
      if (fileType === 'text/plain') {
        extractedText = await fileData.text();
      } else if (fileType === 'application/pdf') {
        // For PDF processing, you would typically use a library like PDF.js or similar
        // For now, we'll just indicate that PDF processing is not fully implemented
        extractedText = `PDF document: ${fileName}\n\nNote: Full PDF text extraction requires additional processing libraries. Please upload text files for full functionality.`;
      } else if (fileType.includes('document') || fileType.includes('presentation')) {
        // For DOCX/PPTX processing, you would use appropriate libraries
        extractedText = `Office document: ${fileName}\n\nNote: Office document text extraction requires additional processing libraries. Please upload text files for full functionality.`;
      } else if (fileType.startsWith('image/')) {
        // For image processing, you would use OCR libraries
        extractedText = `Image file: ${fileName}\n\nNote: Image text extraction (OCR) requires additional processing libraries. Please upload text files for full functionality.`;
      } else {
        extractedText = `Unsupported file type: ${fileType}`;
      }

      console.log(`Extracted text length: ${extractedText.length}`);

      // Update the document with extracted content
      const { error: updateError } = await supabase
        .from('documents')
        .update({ 
          content: extractedText,
          metadata: {
            processed: true,
            processed_at: new Date().toISOString(),
            word_count: extractedText.split(/\s+/).length
          }
        })
        .eq('id', documentId);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      // Create document chunks for better search
      const chunks = createTextChunks(extractedText, 1000); // 1000 char chunks
      
      if (chunks.length > 0) {
        const chunksData = chunks.map((chunk, index) => ({
          document_id: documentId,
          content: chunk,
          metadata: {
            chunk_index: index,
            chunk_size: chunk.length
          }
        }));

        const { error: chunksError } = await supabase
          .from('document_chunks')
          .insert(chunksData);

        if (chunksError) {
          console.warn('Failed to create chunks:', chunksError);
        }
      }

      console.log(`Document processed successfully: ${documentId}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          documentId,
          extractedLength: extractedText.length,
          chunksCreated: chunks.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (textError) {
      console.error('Text extraction error:', textError);
      
      // Still update the document to mark processing attempt
      await supabase
        .from('documents')
        .update({ 
          metadata: {
            processed: false,
            processing_error: textError.message,
            processed_at: new Date().toISOString()
          }
        })
        .eq('id', documentId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text extraction failed',
          details: textError.message
        }),
        { 
          status: 200, // Don't fail the upload, just log the processing error
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('Process document error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function createTextChunks(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    if (currentChunk.length + trimmedSentence.length + 1 > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If single sentence is too long, split it
      if (trimmedSentence.length > maxChunkSize) {
        const words = trimmedSentence.split(' ');
        let wordChunk = '';
        
        for (const word of words) {
          if (wordChunk.length + word.length + 1 > maxChunkSize) {
            if (wordChunk) {
              chunks.push(wordChunk.trim());
              wordChunk = '';
            }
          }
          wordChunk += (wordChunk ? ' ' : '') + word;
        }
        
        if (wordChunk) {
          currentChunk = wordChunk;
        }
      } else {
        currentChunk = trimmedSentence;
      }
    } else {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}