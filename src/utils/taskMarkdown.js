/**
 * A task list as Markdown, for "Copy as markdown" in Task mode.
 *
 * Asked 2026-11-17: "when copying the markdown, non checked and checked tasks
 * should be copied first all non checked task then all checked tasks". And
 * seen in the same message: a task written in the editor is stored as HTML,
 * and was pasted as "- [ ] <p>In task mode ...</p>" -- so the writing is
 * turned back into plain text first.
 */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** A task's writing as one line of plain text. */
export function plainTaskText(text) {
  const raw = String(text ?? '');
  if (!/[<&]/.test(raw)) return raw.trim();
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, '[picture]')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, entity => ENTITIES[entity])
    .replace(/\s+/g, ' ')
    .trim();
}

export function tasksToMarkdown(block) {
  const title = (block?.title || 'Task List').trim();
  const list = Array.isArray(block?.tasks) ? block.tasks : [];
  const open = list.filter(task => !task?.done);
  const done = list.filter(task => task?.done);
  const lines = [`# ${title}`, ''];
  for (const task of open) lines.push(`- [ ] ${plainTaskText(task.text)}`);
  for (const task of done) lines.push(`- [x] ${plainTaskText(task.text)}`);
  return lines.join('\n');
}
