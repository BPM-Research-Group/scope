## License Management

### ✅ List all used licenses

To print all licenses used by your project (including transitive dependencies):

```bash
cargo license

Command to check if any licenses are not allowed (allowed licenses need to be added to the deny.toml)

cargo deny check licenses
```
## 🚀 How to Run the Backend Server

### 1. Prerequisites

- Rust installed (recommended: via [rustup](https://rustup.rs/))
- `cargo` in your PATH
- The backend server code checked out (e.g., in `./backend/`)

### 2. Run the Server

```bash
cd backend
cargo run
```
The server will start on:

http://localhost:3000

## 🧪 Manual Testing with `curl`

You can manually test the backend upload endpoint using `curl`.
It receives a Form which contains a file (binary) and a fileID

### 1. Create a test binary file containing a sentence

```bash
echo -n "Hello from ChatGPT binary test file!" > test.bin && curl -X POST http://localhost:3000/v1/upload/test -F "fileId=test123" -F "file=@test.bin"
```

### Testing GET/DELETE ocel and GET/DELETE ocpt

```bash
curl -i -X GET http://localhost:3000/v1/objects/ocel/123

curl -i -X GET http://localhost:3000/v1/objects/ocpt/123

curl -X DELETE http://localhost:3000/v1/objects/ocpt/123

curl -X DELETE http://localhost:3000/v1/objects/ocpt/123
```