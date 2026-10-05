import ReactMarkdown, { type Components } from "react-markdown";
import { Mention, Prose } from "../../components/ui/track-lite";
import { remarkPlugins } from "./parse";

export type MentionedMember = { username: string; fullName: string };

const allowedProtocols = new Set(["http:", "https:", "mailto:"]);

function allowedUrl(url: string): string | null {
  return URL.canParse(url) && allowedProtocols.has(new URL(url).protocol) ? url : null;
}

export function Markdown({ source, mentions = [] }: { source: string; mentions?: MentionedMember[] }) {
  const components: Components = {
    a: ({ href, children }) =>
      href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        children
      ),
    span: ({ children, ...props }) => {
      const username = (props as { "data-mention"?: string })["data-mention"];
      const member = mentions.find((m) => m.username === username);
      return member ? <Mention title={member.fullName}>{children}</Mention> : children;
    },
  };
  return (
    <Prose>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        urlTransform={allowedUrl}
        components={components}>
        {source}
      </ReactMarkdown>
    </Prose>
  );
}