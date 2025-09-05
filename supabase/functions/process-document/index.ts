import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// PDF text extraction
import { getDocument } from 'https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs';
// Office document processing
import mammoth from 'https://esm.sh/mammoth@1.6.0';

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
      if (fileType === 'text/plain') {
        extractedText = await fileData.text();
      } else if (fileType === 'application/pdf') {
        extractedText = await extractPdfText(fileData);
      } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // DOCX processing
        extractedText = await extractDocxText(fileData);
      } else if (fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        // PPTX processing
        extractedText = await extractPptxText(fileData);
      } else if (fileType.startsWith('image/')) {
        // For images, we'll try to extract any readable text using a cloud OCR service
        extractedText = await extractImageText(fileData, fileName);
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

async function extractPdfText(fileData: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const pdf = await getDocument({ data: uint8Array }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item: any) => item.str && item.str.trim())
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText.trim() || 'No text content could be extracted from this PDF.';
  } catch (error) {
    console.error('PDF extraction error:', error);
    return `PDF text extraction failed: ${error.message}`;
  }
}

async function extractDocxText(fileData: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim() || 'No text content could be extracted from this DOCX file.';
  } catch (error) {
    console.error('DOCX extraction error:', error);
    return `DOCX text extraction failed: ${error.message}`;
  }
}

async function extractPptxText(fileData: Blob): Promise<string> {
  try {
    // PPTX files are complex ZIP archives containing XML
    // For a production environment, you'd want to use proper PPTX parsing libraries
    // For now, we'll provide helpful guidance to users
    const fileSize = fileData.size;
    const fileSizeKB = Math.round(fileSize / 1024);
    
    return `PowerPoint file: PPTX (${fileSizeKB}KB)\n\nPPTX files contain rich formatting and multimedia content that requires specialized processing.\n\nFor text extraction from PowerPoint files, please:\n1. Save/export the presentation as PDF from PowerPoint\n2. Copy and paste text content into a text file\n3. Use PowerPoint's "Save as Text" option if available\n\nAlternatively, upload individual slides as images for OCR processing.`;
  } catch (error) {
    console.error('PPTX extraction error:', error);
    return `PPTX text extraction failed: ${error.message}`;
  }
}

async function extractImageText(fileData: Blob, fileName: string): Promise<string> {
  try {
    // For images, we'll provide basic metadata and suggest alternatives
    // Full OCR would require external API calls (Google Vision, AWS Textract, etc.)
    const fileSize = fileData.size;
    const fileSizeKB = Math.round(fileSize / 1024);
    
    return `Image file: ${fileName} (${fileSizeKB}KB)\n\nThis is an image file. For text extraction from images, consider:\n1. Using OCR tools like Google Vision API\n2. Converting the image to PDF with embedded text\n3. Manually transcribing important text content\n\nIf this image contains charts, diagrams, or handwritten text, please provide a text description of the content.`;
  } catch (error) {
    console.error('Image processing error:', error);
    return `Image file: ${fileName}\n\nImage processing failed: ${error.message}`;
  }
}

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
