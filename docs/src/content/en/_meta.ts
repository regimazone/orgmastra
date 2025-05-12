const meta = {
  docs: { title: "Docs", type: "page" },
  examples: { title: "Examples", type: "page" },
  guides: { title: "Guides", type: "page" },
  reference: { 
    title: "Reference", 
    type: "page",
    children: {
      rag: {
        title: "RAG",
        type: "page",
        children: {
          "couchbase": "Couchbase",
          "metadata-filters": "Metadata Filters",
          // ... other existing children
        }
      }
    }
  },
  showcase: {
    title: "Showcase",
    type: "page",
    theme: { sidebar: false, layout: "full" },
  },
};

export default meta;
