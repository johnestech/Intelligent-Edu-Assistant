import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileUpload } from '@/components/FileUpload';
import { MessageBubble } from '@/components/MessageBubble';
import { Send, Paperclip, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  created_at: string;
}

interface ChatInterfaceProps {
  conversationId: string | null;
  onConversationChange: (id: string) => void;
}

export const ChatInterface = ({ conversationId, onConversationChange }: ChatInterfaceProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    if (!conversationId) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      setMessages((data || []).map(msg => ({
        ...msg,
        role: msg.role as 'user' | 'assistant'
      })));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive',
      });
    }
  };

  const createNewConversation = async (title: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: title.substring(0, 100) // Limit title length
        })
        .select()
        .single();

      if (error) throw error;
      
      return data.id;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to create conversation',
        variant: 'destructive',
      });
      return null;
    }
  };

  const saveMessage = async (conversationId: string, role: 'user' | 'assistant', content: string, metadata?: any) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
          metadata: metadata || {}
        })
        .select()
        .single();

      if (error) throw error;
      
      return data;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to save message',
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() && uploadedFiles.length === 0) return;
    if (!user) return;

    setIsLoading(true);

    try {
      let currentConversationId = conversationId;

      // Create new conversation if needed
      if (!currentConversationId) {
        const title = input.trim() || 'New Chat';
        currentConversationId = await createNewConversation(title);
        if (!currentConversationId) return;
        onConversationChange(currentConversationId);
      }

      // Create user message
      const userMessage = {
        id: `temp-${Date.now()}`,
        role: 'user' as const,
        content: input.trim(),
        metadata: { files: uploadedFiles },
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, userMessage]);
      
      // Save user message
      const savedUserMessage = await saveMessage(
        currentConversationId, 
        'user', 
        input.trim(), 
        { files: uploadedFiles }
      );

      if (savedUserMessage) {
        setMessages(prev => prev.map(msg => 
          msg.id === userMessage.id ? {
            ...savedUserMessage,
            role: savedUserMessage.role as 'user' | 'assistant'
          } : msg
        ));
      }

      // Clear input and files
      const userInput = input.trim();
      setInput('');
      setUploadedFiles([]);
      setShowFileUpload(false);

      // Call AI chat function
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { 
          message: userInput,
          conversationId: currentConversationId,
          files: uploadedFiles
        }
      });

      if (error) throw error;

      // Add AI response
      const aiMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant' as const,
        content: data.response,
        metadata: data.metadata || {},
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMessage]);

      // Save AI message
      await saveMessage(
        currentConversationId, 
        'assistant', 
        data.response, 
        data.metadata || {}
      );

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (files: any[]) => {
    setUploadedFiles(files);
    setShowFileUpload(false);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && !conversationId && (
            <div className="text-center py-12">
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                Welcome to Intelligent Assistant
              </h2>
              <p className="text-muted-foreground mb-6">
                Upload documents and start asking questions to get intelligent answers
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                <Card className="p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardContent className="p-0">
                    <h3 className="font-medium mb-2">📄 Upload Documents</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload PDF, DOCX, PPTX, images, or text files to analyze
                    </p>
                  </CardContent>
                </Card>
                <Card className="p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardContent className="p-0">
                    <h3 className="font-medium mb-2">💬 Ask Questions</h3>
                    <p className="text-sm text-muted-foreground">
                      Get intelligent answers based on your uploaded documents
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          
          {isLoading && (
            <div className="flex justify-center">
              <div className="bg-accent/50 rounded-lg p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* File Upload Display */}
      {uploadedFiles.length > 0 && (
        <div className="border-t border-border bg-background p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="bg-accent/50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  <span>{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-destructive/20"
                    onClick={() => setUploadedFiles(files => files.filter((_, i) => i !== index))}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowFileUpload(!showFileUpload)}
              className="flex-shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your documents..."
              disabled={isLoading}
              className="flex-1"
            />
            
            <Button type="submit" disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          
          {showFileUpload && (
            <div className="mt-4">
              <FileUpload onUpload={handleFileUpload} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};