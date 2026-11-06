import { asActionResult } from "./action-result";
import {
  useCommentsQuery,
  useDeleteCommentMutation,
  useEditCommentMutation,
  useMeQuery,
  useMembersQuery,
  usePostCommentMutation,
} from "./api";
import { CommentThread } from "./CommentThread";
import { Zone, zoneState } from "./Zone";

export function SpaCommentThread({ threadPath, editable }: { threadPath: string; editable: boolean }) {
  const query = useCommentsQuery(threadPath);
  const { data: me } = useMeQuery();
  const { data: members = [] } = useMembersQuery();
  const [postComment] = usePostCommentMutation();
  const [editComment] = useEditCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();

  return (
    <Zone
      what="comments"
      state={zoneState(query)}
      retry={query.refetch}>
      {(comments) => (
        <CommentThread
          comments={comments}
          editable={editable}
          me={me?.username ?? ""}
          admin={me?.role === "admin"}
          members={members}
          postComment={(comment) => asActionResult(postComment({ threadPath, ...comment }).unwrap())}
          editComment={(change) => asActionResult(editComment(change).unwrap())}
          deleteComment={(id) => asActionResult(deleteComment(id).unwrap())}
        />
      )}
    </Zone>
  );
}