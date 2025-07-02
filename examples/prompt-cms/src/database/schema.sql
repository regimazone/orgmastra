-- Prompts table
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    tags TEXT, -- JSON array as string
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

-- Prompt versions table
CREATE TABLE IF NOT EXISTS prompt_versions (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    variables TEXT, -- JSON array as string
    metadata TEXT, -- JSON object as string
    is_published BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
    UNIQUE(prompt_id, version)
);

-- Prompt executions table
CREATE TABLE IF NOT EXISTS prompt_executions (
    id TEXT PRIMARY KEY,
    prompt_version_id TEXT NOT NULL,
    input TEXT NOT NULL, -- JSON object as string
    output TEXT NOT NULL,
    model TEXT,
    tokens INTEGER,
    duration INTEGER, -- milliseconds
    success BOOLEAN NOT NULL,
    error TEXT,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prompts_name ON prompts(name);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt_id ON prompt_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_published ON prompt_versions(is_published);
CREATE INDEX IF NOT EXISTS idx_prompt_executions_version_id ON prompt_executions(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_prompt_executions_executed_at ON prompt_executions(executed_at);

-- Triggers to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_prompts_updated_at 
    AFTER UPDATE ON prompts
    BEGIN
        UPDATE prompts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;