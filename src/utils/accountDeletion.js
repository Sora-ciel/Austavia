// What the app says around "Delete my account" (functions/accountDeletion.js
// is the server's half). Asked for on 2026-11-11.

export const DELETE_ACCOUNT_WARNING =
  'Delete your account and everything in it?\n\n' +
  '• Every folder, picture, habit, theme and setting in your cloud is deleted, for every device.\n' +
  '• The folders on this device are removed too.\n' +
  '• A Pro subscription ends now and is not charged again.\n\n' +
  'This cannot be undone. Use Export first if you want to keep a copy.\n\n' +
  'Next you will sign in once more, to show it is you.';

/** What to tell the person when the deletion did not happen. */
export function deletionFailureMessage(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  if (code.includes('USER-MISMATCH') || code.includes('USER_MISMATCH') || message.includes('user-mismatch')) {
    return 'That was a different Google account. Nothing was deleted; sign in with the account you want to delete.';
  }
  if (message.includes('popup-closed') || message.includes('cancel') || message.includes('closed')) {
    return 'The sign-in was closed. Nothing was deleted.';
  }
  if (code === 'FAILED_PRECONDITION') {
    return 'The sign-in was too long ago. Nothing was deleted; please try again.';
  }
  if (code === 'UNAVAILABLE') {
    return 'Your subscription could not be ended just now, so nothing was deleted (you would have gone on being charged). Please try again later, or write to support@austavia.com.';
  }
  return `Your account could not be deleted: ${message || 'unknown error'}. Nothing you can see has changed; please try again, or write to support@austavia.com.`;
}
