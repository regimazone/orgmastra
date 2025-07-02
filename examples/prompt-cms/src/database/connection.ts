import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseConnection {
  private static instance: Database.Database;
  private static isInitialized = false;

  public static getInstance(): Database.Database {
    if (!DatabaseConnection.instance) {
      // Create database in the project root
      const dbPath = join(process.cwd(), 'prompt-cms.db');
      DatabaseConnection.instance = new Database(dbPath);

      // Enable foreign keys
      DatabaseConnection.instance.pragma('foreign_keys = ON');

      // Initialize schema if not already done
      if (!DatabaseConnection.isInitialized) {
        DatabaseConnection.initializeSchema();
        DatabaseConnection.isInitialized = true;
      }
    }

    return DatabaseConnection.instance;
  }

  private static initializeSchema(): void {
    try {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');

      // Split by semicolon and execute each statement
      const statements = schema
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        DatabaseConnection.instance.exec(statement);
      }

      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  public static close(): void {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
    }
  }
}

export { DatabaseConnection };
export default DatabaseConnection.getInstance();
