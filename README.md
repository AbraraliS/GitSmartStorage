Update my portfolio so that **all available links for each project** (GitHub, Live Demo, Video, Docs, etc.) are displayed clearly and consistently on **project cards**.

---

## Objective

* Show every available link dynamically
* Avoid missing or hidden actions
* Maintain clean UI without clutter
* Keep implementation reusable and data-driven

---

## Phase 1 — Data Standardization

Ensure project schema supports all link types:

```ts id="linkschema"
interface Project {
  github?: string;
  live?: string;
  demo?: string;
  videos?: string[];
  docs?: string;
}
```

* Do NOT mix multiple fields for same purpose
* Prefer:

  * `github`
  * `live`
  * `videos` (array)

---

## Phase 2 — Normalize Link Source

Create unified link list per project:

```ts id="linknormalize"
const links = [
  project.github && { label: "GitHub", url: project.github },
  project.live && { label: "Live", url: project.live },
  project.demo && { label: "Demo", url: project.demo },
  project.videos?.[0] && { label: "Video", url: project.videos[0] },
  project.docs && { label: "Docs", url: project.docs }
].filter(Boolean);
```

---

## Phase 3 — UI Rendering (Project Card)

Render all links dynamically:

```tsx id="linkrender"
<div className="flex flex-wrap gap-2 mt-3">
  {links.map((link, index) => (
    <a
      key={index}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="px-3 py-1 text-sm rounded-md border hover:bg-muted transition"
    >
      {link.label}
    </a>
  ))}
</div>
```

---

## Phase 4 — Icon Support (Optional but Recommended)

Add icons per link:

```ts id="linkicons"
const linkIcons = {
  GitHub: <FaGithub />,
  Live: <FaExternalLinkAlt />,
  Demo: <FaPlay />,
  Video: <FaYoutube />,
  Docs: <FaBook />
};
```

---

## Phase 5 — Mobile Optimization

* Ensure wrapping:

```tsx id="linkmobile"
className="flex flex-wrap gap-2"
```

* Prevent overflow:

  * No fixed width buttons
  * Use small padding on mobile

---

## Phase 6 — Priority Handling

Optional ordering:

1. Live
2. GitHub
3. Video
4. Demo
5. Docs

Implement sort if needed.

---

## Phase 7 — Constraints

* Do NOT hardcode per project
* Do NOT render empty links
* Keep UI minimal and consistent
* Maintain accessibility (clickable, readable)

---

## Phase 8 — Validation

Check:

* All available links appear
* No missing buttons
* No broken links
* Mobile layout clean
* No overflow

---

## Output Requirement

* Dynamic link rendering on project cards
* All available links visible
* Clean responsive layout
