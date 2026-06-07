# NUST-SAS Web Portal

The Instructor Dashboard for the NUST Secure Attendance System.

## Tech Stack

- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3 + clsx + tailwind-merge
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router DOM 6
- **Icons**: Lucide React
- **Backend Integration**: Supabase JS

## Project Structure

```
src/
├── components/         # Shared UI components
│   └── ui/            # Generic UI elements (Button, Card, Input, etc.)
├── features/          # Feature-based modules
│   ├── auth/          # Authentication (Login)
│   ├── dashboard/     # Main dashboard view
│   ├── qr/            # QR Code Generator logic
│   └── attendance/    # Attendance logs and tables
├── hooks/             # Custom React hooks (useAuth, etc.)
├── layouts/           # Page layouts (DashboardLayout)
├── lib/               # Utilities and configurations (supabase, utils)
└── App.tsx            # Main application entry and routing
```

## Features

1.  **Secure Authentication**: Instructor login via Supabase Auth.
2.  **Dynamic QR Generation**: Generates cryptographically signed JWTs every 10 seconds for the 4-Check Protocol.
3.  **Real-time Dashboard**: View live attendance stats.
4.  **Attendance Logs**: detailed audit trail of student scans with verification status.

## Getting Started

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Set up environment variables:
    Create `.env.local` with:
    ```
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

3.  Run development server:
    ```bash
    npm run dev
    ```

4.  Build for production:
    ```bash
    npm run build
    ```
