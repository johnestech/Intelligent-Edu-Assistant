import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { useEffect } from 'react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-2xl mx-auto">
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 p-4 rounded-full">
            <BookOpen className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-4 text-foreground">Intelligent Educational Assistant</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Your personal AI companion for document analysis and intelligent conversations
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 rounded-lg border border-border">
            <h3 className="font-semibold mb-2">📄 Document Processing</h3>
            <p className="text-sm text-muted-foreground">
              Upload PDF, DOCX, PPTX, and more for intelligent analysis
            </p>
          </div>
          <div className="p-6 rounded-lg border border-border">
            <h3 className="font-semibold mb-2">🤖 AI Chat</h3>
            <p className="text-sm text-muted-foreground">
              Ask questions and get intelligent answers based on your documents
            </p>
          </div>
          <div className="p-6 rounded-lg border border-border">
            <h3 className="font-semibold mb-2">💾 Conversation History</h3>
            <p className="text-sm text-muted-foreground">
              Keep track of all your conversations and documents
            </p>
          </div>
        </div>
        <Button 
          onClick={() => navigate('/auth')} 
          size="lg"
          className="text-lg px-8 py-3"
        >
          Get Started
        </Button>
      </div>
    </div>
  );
};

export default Index;
