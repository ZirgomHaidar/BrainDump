# braindump (BD)

**Personal Dumping System v1.0** — A technical, high-contrast digital workspace for offloading tasks, decisions, ideas, and worries. Designed with a minimalist **Outline / Skeletal UI** aesthetic for maximum clarity and zero distraction.

## ◢ Core Modules
- **TO-DOs**: Urgent tasks and small wins.
- **DECISIONS**: Choices weighing on your mind that need resolution.
- **IDEAS**: Creative sparks and project concepts worth exploring.
- **LET GO**: Worries and external pressures—write them down and cross them out.

## ◢ Key Features
- **Daily Continuity**: Persistent date strip to track and revisit daily dumps.
- **Live Synchronization**: Real-time Firebase integration with status indicators (Live / Connecting).
- **Technical Progress Tracking**: Skeletal progress bars for each cognitive section.
- **Mobile Optimized**: Swipe-to-delete gestures and double-tap editing for on-the-go offloading.
- **Non-Destructive Past**: Read-only view for historical days to maintain a true record of your thoughts.

## ◢ Tech Stack
- **Frontend**: React 18 (Vite)
- **Database**: Firebase (Firestore)
- **Styling**: Vanilla CSS (Custom properties-based design system)

## ◢ Installation

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Setup Environment**:
    Create a `.env` file based on `.env.example` with your Firebase credentials.
4.  **Run Development Server**:
    ```bash
    npm run dev
    ```
