# Repo for Evaluation of Online DF$^2$ Graph Discovery

## How to Perform Evaluation
The raw data on which the evaluation of the proposed method is based is contained in the files `evaluation/evaluation_results.csv` and `evaluation/parameter_search_results.csv`.

### Evaluated Event Logs
Below is a summary of the statistics of the six evaluated event logs:

| Log File | Events | Activities | Objects | Object Types |
| --- | ---: | ---: | ---: | ---: |
| `age_of_empires_ocel2.json` | 2,372,505 | 829 | 361,935 | 30 |
| `logistics.json` | 35,413 | 14 | 13,910 | 7 |
| `lrmsCollection.json` | 28,278 | 22 | 8,819 | 9 |
| `order-management.json` | 21,008 | 11 | 10,840 | 6 |
| `procureToPay.json` | 14,671 | 10 | 9,543 | 7 |
| `reasoning_benchmark.json` | 31,709 | 32 | 1,645 | 2 |

They can be reproduced as follows:

1. **Place the Event Logs:**
   Create the `evaluation_ocels/` directory in the project root. Copy and paste the required OCEL log files into the `evaluation_ocels/` (These files are not tracked in git due to size constraints).

2. **Run the Evaluation Tests:**
   Navigate to the `backend/` directory and execute the respective tests:

   * **Full Stream Evaluation:**
     To evaluate per-event processing times, memory usage, and structural conformance over the stream across all logs, run:
     ```bash
     cd backend
     cargo test --release run_full_evaluation -- --ignored --nocapture
     ```
     This generates `evaluation/evaluation_results.csv`.

   * **Parameter Grid Search Evaluation:**
     To run the grid search across different combinations of $T_{\text{hint}}$ and $T_{\text{max}}$ configurations, run:
     ```bash
     cd backend
     cargo test --release run_unified_parameter_search_evaluation -- --ignored --nocapture
     ```
     This generates `evaluation/parameter_search_results.csv`.

The tests automatically save the output CSV files directly into the `evaluation/` directory in the project root.

## How to Visualize Results
To regenerate all results from the evaluation CSV files:

```bash
cd evaluation
.venv/bin/python3 visualize_all.py
```

## Folder Structure

### 1. Processing Time and Scalability (`plots/exp1_time/`)
- **Stability** (`Plot_A_Stability.png`): Boxplots and scatter plots showing the distribution of per-event processing times across all logs.
- **Scalability** (`Plot_B_Scalability.png`): Combined plot showing processing time vs. event index for representative logs (Age of Empires & Order Management).
- **Scalability Individual**: Folder containing scalability plots for every individual log.

### 2. Memory and Validity (`plots/exp2_memory_validity/`)
- **Global Tradeoff** (`Plot_C_Global_Tradeoff.png`): Aggregate plot showing the global relationship between memory savings and structural deviation (FP/FN) with a combined legend.
- **Memory Dynamics** (`Plot_D_Memory_Dynamics.png`): Combined plot showing memory consumption for representative logs (without scientific notation on x-axis).
- **Memory Dynamics Individual**: Folder containing memory dynamics plots for every individual log.
- **Recovery Curve** (`Plot_E_Recovery_Curve.png`): Combined plot showing structural deviation recovery over time for representative logs.
- **Recovery Curve Individual**: Folder containing recovery curve plots for every individual log.
- **Combined Memory & Accuracy** (`Plot_DE_Memory_Accuracy.png`): Combined side-by-side plots for representative logs showcasing absolute memory dynamics and structural deviation over event indices.
- **Metrics Table** (`Table_Performance_Metrics.tex`): LaTeX table summarizing drift and memory metrics per log.

### 3. Parameter Search (`plots/exp3_parameters/`)
- **Pareto Frontier** (`Plot_F_Pareto_Frontier.png`): Detailed Pareto frontier for all logs, including sweet-spot annotations with inactivity ranges and optimized placement.

## Requirements
- Rust
- Python 3.9+
- pandas, matplotlib, seaborn, numpy



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
