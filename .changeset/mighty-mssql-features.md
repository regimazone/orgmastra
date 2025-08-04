---
"@mastra/mssql": minor
---

feat(mssql): implement comprehensive scoring system and enhance storage operations

- Add full CRUD operations for scoring system (getScoreById, saveScore, getScoresByScorerId, etc.)
- Implement message deletion functionality with thread timestamp updates
- Enhance thread management with sorting options and improved pagination
- Add batch trace insertion for improved performance
- Implement proper storage domain initialization with all operation bindings
- Enhance message parsing and formatting with better v1/v2 support
- Improve table operations with better foreign key handling
- Add float data type support in schema creation
- Enhance timestamp handling with proper SQL DateTime2 usage
- Update core dependency to latest version

BREAKING CHANGE: deleteMessages support is now enabled (was previously false) 