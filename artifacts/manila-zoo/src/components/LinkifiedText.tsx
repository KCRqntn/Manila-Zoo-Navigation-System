import React from "react";

// Web addresses and email addresses in plain text (chatbot replies, FAQ answers)
const LINK = /(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** Text with its web and email addresses turned into links. Built as React elements, never HTML. */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {text.split(LINK).map((part, i) => {
        if (i % 2 === 0) return part;
        // A sentence's final period isn't part of the address
        const trail = part.match(/[.,;:]+$/)?.[0] ?? "";
        const target = trail ? part.slice(0, -trail.length) : part;
        const href = target.includes("@") && !target.startsWith("http") ? `mailto:${target}` : target;
        return (
          <React.Fragment key={i}>
            <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
              className="underline underline-offset-2 break-all hover:opacity-80">{target}</a>
            {trail}
          </React.Fragment>
        );
      })}
    </>
  );
}
