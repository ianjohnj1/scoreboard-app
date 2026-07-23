import { supabase } from './supabase';
import type { Comment } from './supabase';

export async function getComments(contextType: 'match' | 'event', contextId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function postComment(
  contextType: 'match' | 'event',
  contextId: string,
  content: string,
  type: 'comment' | 'cheer' = 'comment'
): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    // author_player_id / author_display_name are stamped server-side by
    // trg_guard_comments - never sent from the client.
    .insert({ context_type: contextType, context_id: contextId, content, type })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function hideComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .update({ is_hidden: true })
    .eq('id', commentId);

  if (error) throw error;
}
