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

## Exporting Models to PM4Py

SCOPE can export stored OCPT and OCPN models as JSON files that can be loaded into PM4Py with the `scope-pm4py` Python package.

### 1. Create or Load a Model in SCOPE

Use SCOPE to mine or upload an OCPT/OCPN model. The backend stores models under a `file_id`.

If you have an OCPT and need an OCPN first, use the SCOPE frontend conversion workflow. The frontend will call the backend and create the OCPN model for you.

The backend endpoint behind this workflow is `GET /v1/ocpn/from_ocpt/{ocpt_id}`.

### 2. Export for PM4Py

Use the SCOPE frontend export action for the model you want to export. The planned frontend workflow is:

- Open the OCPT or OCPN model in SCOPE
- Click the PM4Py export button
- SCOPE writes the export JSON to the backend host's Downloads folder

The backend endpoints behind this button are:

```text
GET /v1/export/pm4py/ocpt/{file_id}
GET /v1/export/pm4py/ocpn/{file_id}
```

The backend writes the generated JSON file to the backend host's Downloads folder, for example:

```text
C:\Users\<user>\Downloads\scope_ocpt_<file_id>_pm4py.json
C:\Users\<user>\Downloads\scope_ocpn_<file_id>_pm4py.json
```

The API response includes the exact `path`, `filename`, `schema`, and `schema_version`.

### 3. Install the Python Adapter

Install the adapter package:

```bash
python -m pip install scope-pm4py
```

Import name:

```python
from scope_pm4py import load_ocpt, load_ocpn
```

### 4. Use the Export in Python

```python
from scope_pm4py import load_ocpt, load_ocpn
import pm4py

ocpt_path = r"C:\Users\<user>\Downloads\scope_ocpt_<file_id>_pm4py.json"
ocpn_path = r"C:\Users\<user>\Downloads\scope_ocpn_<file_id>_pm4py.json"

tree = load_ocpt(ocpt_path)
ocpn = load_ocpn(ocpn_path)

print(type(tree).__name__)
print(sorted(ocpn["object_types"]))
print(len(ocpn["petri_nets"]))

# Optional PM4Py visualization:
# pm4py.view_process_tree(tree)
# pm4py.view_ocpn(ocpn, format="svg")
```

The exported JSON is an interchange format. Use `scope-pm4py` to reconstruct PM4Py runtime objects such as `ProcessTree`, `PetriNet`, and `Marking`.
