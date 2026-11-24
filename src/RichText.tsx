import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "./ui";

/** Only http(s) and in-page links survive; everything else (javascript:, data:, …) is dropped. */
const safeUrl = (url: string) => {
  const value = defaultUrlTransform(url);
  return /^https?:\/\//i.test(value) || value.startsWith("#") ? value : "";
};

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer nofollow">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Images are shown as links so viewing a thread never loads third-party content.
  img: ({ src, alt }) =>
    typeof src === "string" && src ? (
      <a className="md-image" href={src} target="_blank" rel="noreferrer nofollow">
        <Icon name="link" size={12} /> {alt || "Image"}
      </a>
    ) : null,
  pre: ({ children }) => <pre className="md-pre">{children}</pre>,
  code: ({ className, children }) => {
    const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
    return language ? (
      <code className="md-code-block" data-language={language}>
        {children}
      </code>
    ) : (
      <code className={className}>{children}</code>
    );
  },
  h1: ({ children }) => <h4>{children}</h4>,
  h2: ({ children }) => <h4>{children}</h4>,
  h3: ({ children }) => <h5>{children}</h5>,
  h4: ({ children }) => <h5>{children}</h5>,
  table: ({ children }) => (
    <div className="md-table">
      <table>{children}</table>
    </div>
  ),
  input: ({ checked }) => (
    <span className={`md-check ${checked ? "is-done" : ""}`} aria-label={checked ? "Done" : "Not done"}>
      {checked ? <Icon name="check" size={11} /> : null}
    </span>
  ),
};

/**
 * Renders GitHub-flavored Markdown from issue and comment bodies as React elements.
 * Raw HTML is never interpreted (react-markdown ignores it without rehype-raw).
 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
