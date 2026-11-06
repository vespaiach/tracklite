export type EventTarget = { issueId: string } | { projectId: string };

export type DomainEvent =
  | { type: "IssueAssigned"; actorId: string; issueId: string; assigneeIds: string[] }
  | { type: "DescriptionSaved"; actorId: string; target: EventTarget; text: string }
  | { type: "CommentPosted"; actorId: string; target: EventTarget; commentId: string; text: string }
  | { type: "CommentEdited"; actorId: string; target: EventTarget; commentId: string; text: string };