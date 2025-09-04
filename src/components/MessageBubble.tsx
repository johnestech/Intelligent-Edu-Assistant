import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, User, FileText, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  created_at: string;
}

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === 'user';
  const files = message.metadata?.files || [];
  const sources = message.metadata?.sources || [];

  const formatContent = (content: string) => {
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => `<p>${line}</p>`)
      .join('');
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className={isUser ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={`flex flex-col space-y-2 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <Card className={`${isUser ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
          <CardContent className="p-3">
            {/* Show uploaded files for user messages */}
            {isUser && files.length > 0 && (
              <div className="mb-3 space-y-2">
                {files.map((file: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 text-sm opacity-90">
                    <FileText className="h-4 w-4" />
                    <span>{file.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
            />

            {/* Show sources for assistant messages */}
            {!isUser && sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Sources:</p>
                <div className="space-y-1">
                  {sources.map((source: any, index: number) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      {source.document_title || `Document ${index + 1}`}
                      {source.page && ` (p. ${source.page})`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className={`text-xs text-muted-foreground ${isUser ? 'text-right' : 'text-left'}`}>
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
};