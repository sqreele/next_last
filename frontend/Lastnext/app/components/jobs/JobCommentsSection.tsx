'use client';

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader, MessageSquare, Send, AlertCircle } from 'lucide-react';
import { Textarea } from '@/app/components/ui/textarea';
import { Button } from '@/app/components/ui/button';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { useToast } from '@/app/components/ui/use-toast';
import type { JobComment } from '@/app/lib/types';

type Props = {
  jobId: string;
};

function formatTimestamp(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as any;
    if (typeof data === 'string') return data;
    if (data?.detail) return String(data.detail);
    if (data?.comment) return Array.isArray(data.comment) ? data.comment.join(', ') : String(data.comment);
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

const JobCommentsSection: React.FC<Props> = ({ jobId }) => {
  const { toast } = useToast();
  const [comments, setComments] = useState<JobComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/jobs/${jobId}/comments/`, { withCredentials: true });
      const data = res.data;
      const list: JobComment[] = Array.isArray(data) ? data : (data?.results || []);
      setComments(list);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load comments'));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) {
      toast({ title: 'Comment cannot be empty', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(
        `/api/jobs/${jobId}/comments/`,
        { comment: value },
        { withCredentials: true },
      );
      // Append the new comment optimistically (server returns full comment shape)
      if (res.data && res.data.id) {
        setComments((prev) => [...prev, res.data as JobComment]);
      } else {
        fetchComments();
      }
      setText('');
      toast({ title: 'Comment added', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Failed to add comment',
        description: getErrorMessage(err, 'Please try again'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pcms-section-card space-y-4 p-5 sm:p-6" aria-label="Job comments">
      <h2 className="flex items-center gap-2 text-lg font-black text-[var(--pcms-text)]">
        <MessageSquare className="h-5 w-5" /> Comments
        {comments.length ? (
          <span className="rounded-full bg-gray-100 px-2 text-xs font-medium text-gray-600">
            {comments.length}
          </span>
        ) : null}
      </h2>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-sm text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader className="h-4 w-4 animate-spin" /> Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-gray-50 p-4 text-center text-sm text-gray-500">
          No comments yet
        </div>
      ) : (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {c.author_name || c.author_username || 'Unknown'}
                </span>
                <time className="text-xs text-gray-500" dateTime={c.created_at}>
                  {formatTimestamp(c.created_at)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">
                {c.comment}
              </p>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          rows={3}
          disabled={submitting}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !text.trim()} className="gap-1">
            {submitting ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Add Comment
          </Button>
        </div>
      </form>
    </section>
  );
};

export default JobCommentsSection;
