# Alfassa Folder Structure

```text
src/
├── app/                  # Routing, layouts, and top-level page components
├── assets/               # Static assets (images, icons, fonts)
├── engines/              # Core domain business logic and processors
│   ├── ai-engine/        
│   ├── concept-engine/   
│   ├── graph-engine/     
│   ├── knowledge-engine/ 
│   ├── material-engine/  
│   ├── revision-engine/  
│   └── search-engine/    
├── features/             # Feature-specific UI, hooks, and local state
│   ├── activity/
│   ├── authentication/
│   ├── collections/
│   ├── concepts/
│   ├── explore/
│   ├── folders/
│   ├── graph/
│   ├── home/
│   ├── material/
│   ├── projects/
│   ├── revision/
│   ├── search/
│   └── settings/
├── services/             # External service integrations (Firebase, Stripe, etc.)
├── shared/               # Reusable UI components (buttons, cards), global hooks, utils
│   ├── components/
│   ├── hooks/
│   ├── providers/
│   └── utils/
└── types/                # Global TypeScript interfaces, enums, and Zod schemas
```

This folder structure separates UI feature modules from the core background engines.
