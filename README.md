# SCOPE

SCOPE is an open-source software project which allows the user to discover and explore object-centric processes.

## Getting Started

### Prerequisites

Ensure you have the following installed on your system:

-   Rust
-   Node.js: Version 22.19.0 or higher

### Installation & Setup

1.  Clone the repository:

    ```
    git clone https://github.com/BPM-Research-Group/scope
    cd scope
    ```

2.  Set up Environment Variables:
    -   The application requires environment variables, located in `.env`, to run. We've included the required variables in an example file.

        ```
        cp .env.dev.example .env
        ```

3.  Install Frontend Dependencies:
    -   Navigate to the frontend directory: `cd frontend`
    -   Install the necessary packages: `npm install`

### Running the Application

To use SCOPE, you'll need to run both the backend and frontend servers.

1.  Start the Backend Server:
    -   Navigate to the `backend` directory from the project root.
    -   Start up the backend server: `cargo run` (This may take a while on your first execution, as it is installing the required backend dependencies)
    -   The backend API will be running in the background and accepts requests at this URL: `http://localhost:3000`

2.  Start the Frontend Server:
    -   Navigate to the `frontend` directory.
    -   Start the development server: `npm run dev`
    -   You can now access the SCOPE application in your browser at `http://localhost:5173`.
