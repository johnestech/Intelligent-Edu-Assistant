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
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { message, conversationId, files } = await req.json();

    console.log(`Processing AI chat request for conversation: ${conversationId}`);

    // Get conversation history for context
    let conversationHistory = '';
    if (conversationId) {
      const { data: messages } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(10); // Last 10 messages for context

      if (messages && messages.length > 0) {
        conversationHistory = messages
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');
      }
    }

    // Get user's documents for context
    const userIdQuery = await supabase.auth.getUser();
    const userId = userIdQuery.data.user?.id;

    let documentContext = '';
    let sources: any[] = [];

    if (userId) {
      // Search for relevant document chunks
      const { data: documents } = await supabase
        .from('documents')
        .select('id, title, content, metadata')
        .eq('user_id', userId)
        .not('content', 'is', null)
        .limit(5);

      if (documents && documents.length > 0) {
        // Simple keyword matching for relevant documents
        const keywords = message.toLowerCase().split(' ').filter(word => word.length > 3);
        const relevantDocs = documents.filter(doc => {
          if (!doc.content) return false;
          const content = doc.content.toLowerCase();
          return keywords.some(keyword => content.includes(keyword));
        });

        if (relevantDocs.length > 0) {
          documentContext = relevantDocs
            .map(doc => `Document: ${doc.title}\nContent: ${doc.content.substring(0, 1000)}...`)
            .join('\n\n---\n\n');

          sources = relevantDocs.map(doc => ({
            document_id: doc.id,
            document_title: doc.title,
            relevance_score: 1.0
          }));
        }
      }
    }

    // Build the prompt for Gemini
    let prompt = '';
    
    if (documentContext) {
      prompt = `You are an intelligent educational assistant. Answer the user's question based on the provided documents and conversation history.

DOCUMENTS:
${documentContext}

${conversationHistory ? `CONVERSATION HISTORY:\n${conversationHistory}\n\n` : ''}

USER QUESTION: ${message}

Please provide a helpful, accurate answer based on the documents provided. If the documents don't contain relevant information, say so and provide general assistance. Always cite which document you're referencing when possible.`;
    } else {
      prompt = `You are an intelligent educational assistant. ${conversationHistory ? `Here's the conversation history:\n${conversationHistory}\n\n` : ''}

USER QUESTION: ${message}

Please provide a helpful response. If you need specific document content to answer accurately, let the user know they should upload relevant documents.`;
    }

    console.log('Calling Gemini API...');

    // Call Google Gemini API
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    
    if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
      console.error('Invalid Gemini response:', geminiData);
      throw new Error('Invalid response from Gemini API');
    }

    const aiResponse = geminiData.candidates[0].content.parts[0].text;

    console.log('AI response generated successfully');

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        metadata: {
          sources: sources,
          has_document_context: documentContext.length > 0,
          conversation_id: conversationId
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI chat error:', error);
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