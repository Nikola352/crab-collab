# Collaborative Jupyter Notebook in Rust

## Project Overview

This project implements a real-time collaborative Jupyter notebook with a focus on conflict-free synchronization and efficient backend architecture. Multiple users can simultaneously edit notebook cells, execute Python code, and see each other's changes in real-time.

The project is divided into two phases:
- **Course Project** (NTP): Building a complete, working collaborative notebook system in Rust with basic conflict resolution
- **Bachelor's Thesis**: Research and implementation of advanced conflict resolution strategies using CRDTs (Conflict-free Replicated Data Types) and Operational Transforms

## System Architecture

### High-level components

```
┌────────────────────────────────────────────────┐
│              Browser Clients                   │
│  ┌──────────────────────────────────────────┐  │
│  │  React Frontend + WebSocket Client       │  │
│  │  - Notebook UI (cells, outputs)          │  │
│  │  - Real-time sync                        │  │
│  │  - User presence                         │  │
│  └────────────────┬─────────────────────────┘  │
└───────────────────┼────────────────────────────┘
                    │ WebSocket
┌───────────────────▼────────────────────────────┐
│           Rust Backend (Axum)                  │
│  ┌──────────────────────────────────────────┐  │
│  │  WebSocket Handler                       │  │
│  │  - Connection management                 │  │
│  │  - Message broadcasting                  │  │
│  │  - User presence tracking                │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Notebook State Manager                  │  │
│  │  - Cell list (structure)                 │  │
│  │  - Cell content (code/markdown)          │  │
│  │  - Cell metadata (type, ID, position)    │  │
│  │  - Cell outputs (execution results)      │  │
│  │  - Conflict resolution (CRDT/OT)         │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Execution Queue                         │  │
│  │  - Pending cell executions               │  │
│  │  - Execution ordering                    │  │
│  │  - Conflict resolution for execution     │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Kernel Communication                    │  │
│  │  - ZeroMQ message handling               │  │
│  │  - Execute requests                      │  │
│  │  - Output parsing                        │  │
│  └────────────────┬─────────────────────────┘  │
└───────────────────┼────────────────────────────┘
                    │ ZeroMQ
┌───────────────────▼────────────────────────────┐
│     Jupyter Kernel (Python)                    │
│     - Code execution                           │
│     - Variable state                           │
│     - Output generation                        │
└────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- **React** with TypeScript
- **Tailwind CSS** for styling
- **WebSocket API** for real-time communication
- **Monaco Editor** for code editing

**Backend:**
- **Rust** with **Tokio** async runtime
- **Axum** web framework for WebSocket handling
- **Serde** for JSON serialization
- **ZeroMQ** (via `zeromq` crate) for Jupyter kernel communication
- **Automerge** (optional, for course project) for CRDT operations

**Execution:**
- **Jupyter Kernel** (Python) via Jupyter Protocol
- **ZeroMQ** for kernel communication

---

## Rust Server Architecture

The Rust backend is organized into several key modules, each responsible for a distinct aspect of the collaborative notebook:

### 1. **WebSocket Connection Manager**

**Responsibilities:**
- Accept and manage WebSocket connections from multiple clients
- Maintain active connection pool with user identification
- Broadcast messages to all connected clients or specific subsets
- Handle connection lifecycle (connect, disconnect, reconnect)
- Track user presence (who's online, cursor positions)

### 2. **Notebook State Manager**

**Responsibilities:**
- Maintain the authoritative state of the notebook document
- Manage cell list structure (ordered collection of cells)
- Store and update cell content (code or markdown text)
- Track cell metadata (ID, type, creation time, author)
- Apply conflict resolution strategies to incoming operations

### 3. **Execution Queue Manager**

**Responsibilities:**
- Queue cell execution requests from multiple users
- Ensure sequential execution (one cell at a time)
- Handle execution conflicts (concurrent execution requests)
- Track execution state (idle, executing, waiting)
- Broadcast execution status to all clients

**Conflict Resolution:**
- First-come-first-served queue ordering
- Handle "execute while editing" scenarios
- Manage "execute deleted cell" edge cases

### 4. **Kernel Communication Manager**

**Responsibilities:**
- Establish and maintain ZeroMQ connection to Jupyter kernel
- Send execute requests following Jupyter messaging protocol
- Parse kernel responses (output, errors, display data)
- Handle kernel lifecycle (start, restart, interrupt)

**Protocol Implementation:**
- **Execute Request**: Send code to kernel
- **Execute Reply**: Receive execution status
- **Stream**: Capture stdout/stderr
- **Display Data**: Handle rich outputs (images, HTML, etc.)
- **Error**: Parse and format execution errors

---

## Conflict Resolution Strategies

Different parts of the notebook state require different conflict resolution approaches. The project will explore and implement multiple strategies:

### Cell Content (Text Editing)

**Potential Approaches:**
- **Operational Transform (OT)**: Transform concurrent text operations to maintain consistency
- **CRDT (e.g., RGA, YATA)**: Use character-level conflict-free data structures
- **Automerge**: Leverage existing CRDT library (course project)

**Example Conflict:**
```
Initial: "print(x)"
User A: "print(x + 1)"
User B: "print(x * 2)"
→ CRDT ensures convergent result: "print(x + 1 * 2)" or similar
```

### Cell List Structure

**Potential Approaches:**
- **List CRDT (e.g., RGA, LSEQ)**: Position-based unique identifiers
- **Fractional Indexing**: Cells have fractional positions between neighbors
- **Tombstone Strategy**: Mark deleted cells rather than removing them

**Example Conflict:**
```
Initial: [Cell1, Cell2, Cell4]
User A: Insert Cell3 between Cell2 and Cell4
User B: Insert Cell5 between Cell2 and Cell4
→ List CRDT determines consistent ordering
```

### Cell Metadata

**Approach:**
- **Last-Write-Wins (LWW)**: Use Lamport timestamps
- **Versioning**: Move conflict resolution to UI

### Execution Queue

**Approach:**
- **Sequential Queue with Timestamps**: First request wins
- **Explicit Locking**: Lock cell during execution (thesis exploration)

**Example Conflict:**
```
User A: Execute Cell2
User B: Execute Cell2 (simultaneously)
→ Queue ensures one executes, then the other
```

### Design Philosophy

The project maintains **flexibility in conflict resolution strategies**. During the course project phase, basic strategies (or Automerge) will be used. The bachelor's thesis phase will involve:
- Researching optimal strategies for each conflict type
- Implementing and comparing multiple approaches
- Benchmarking performance and correctness
- Potentially contributing novel approaches for notebook-specific conflicts

---

## Why Rust?

Rust is an ideal choice for this project for several reasons:

### 1. **Performance**
- **Efficient WebSocket handling**: Tokio's async runtime handles many concurrent connections with minimal overhead
- **Low latency**: In-memory operations measured in nanoseconds, critical for real-time collaboration
- **Zero-cost abstractions**: High-level code compiles to performant machine code

### 2. **Memory Safety**
- **Prevents data races**: Type system ensures safe concurrent access to notebook state
- **No garbage collection pauses**: Predictable latency for real-time applications
- **Safe subprocess management**: Managing Jupyter kernel process without memory leaks

### 3. **Type System for Correctness**
- **Type-safe message handling**: Compile-time guarantees for WebSocket messages
- **CRDT implementation**: Rust's type system enforces CRDT invariants at compile time
- **Error handling**: `Result<T, E>` forces explicit error handling

### 4. **Concurrency**
- **Async/await**: Natural expression of concurrent WebSocket connections
- **Send + Sync traits**: Compiler-verified safe data sharing across threads
- **Lock-free data structures**: When appropriate for performance

### 5. **Academic Value**
- Demonstrates modern systems programming practices
- Showcases Rust's suitability for concurrent, networked applications
- Provides foundation for researching conflict resolution algorithms with strong correctness guarantees

---

## Explicitly Out of Scope

To maintain focus on core contributions (Rust implementation + conflict resolution research), the following features are **intentionally excluded**:

### Not Implemented

- **Multiple Kernels**: Single Python kernel per session (no R, Julia, etc.)
- **Multi-Language Support**: Python execution only
- **Authentication/Authorization**: No user login, session management, or access control
- **Persistence**: No database, file storage, or state recovery after restart (sessions are ephemeral)
- **File Management**: No workspace, directory structure, or multiple notebook support
- **Offline Editing**: Requires active connection (though CRDT architecture makes this a natural future extension)
- **Extensions/Plugins**: No plugin architecture or third-party extensions
- **Rich Outputs**: Limited support for complex widgets, interactive plots (basic images/text only)

### Rationale

This project **deliberately focuses on**:
1. **Clean, idiomatic Rust implementation** of a non-trivial distributed system
2. **Deep exploration of conflict resolution** in collaborative editing

Adding auxiliary features would dilute these core objectives. The codebase remains **lean, understandable, and maintainable**, making it suitable for:
- Academic evaluation of Rust proficiency
- Research into CRDT/OT algorithms
- Future expansion in any direction without technical debt

### Open to Expansion

The architecture is designed to accommodate future additions:
- Offline-first architecture (natural with CRDTs)
- Persistence layer (PostgreSQL, Redis, files)
- Version history/snapshots
- Additional language kernels
- Multiple notebooks/workspaces
- Authentication (JWT, OAuth)
- Real-time chat/comments

These are **potential thesis extensions** or post-graduation projects, not current scope.

---

## Scope Definition

### Course Project Scope (Rust-Focused)

#### Goal:
Deliver a complete, usable computational notebook system implemented in Rust.

#### Focus areas:
- Clean Rust architecture
- Async programming
- WebSocket communication
- Notebook state modeling
- Python kernel integration via ZMQ

#### Features:
- Single-user usage OR
- Naive collaboration using:
    + First-write-wins
    + Centralized conflict resolution
- Optional delegation of conflict handling to a single CRDT library (e.g. Automerge) without deep research

#### Important:
No custom CRDT or OT research is required at this stage.

### Bachelor’s Thesis Scope (Research & Extension)

#### Goal:
Extend the system with a rigorous study and implementation of collaborative conflict resolution techniques.

#### Focus areas:
- CRDTs vs Operational Transforms
- Suitability of different strategies for different notebook components
- Implementation of selected approaches
- Integration into the existing Rust backend

#### Possible Thesis Contributions
- Comparative analysis of CRDT-based and OT-based synchronization
- Implementation of multiple strategies within the same system
- Performance benchmarks (latency, memory, throughput)
- Evaluation of correctness and user experience trade-offs

This phase transforms the project from a system implementation into a **research-backed engineering thesis**.

---

## Summary

This project bridges **systems programming** and **distributed systems research**:

**Course Project:** A working demonstration of Rust's capabilities for building real-time, concurrent networked applications, with practical experience in WebSocket handling, async programming, and integration with external systems (Jupyter).

**Bachelor's Thesis:** A research-oriented exploration of conflict resolution in collaborative editing, contributing to the academic understanding of CRDTs/OT in the specific context of computational notebooks, backed by implementation and empirical evaluation.

By maintaining a focused scope, the project achieves depth in its core areas while remaining manageable within academic timeframes. The result is both a functional system and a research contribution with clear academic value.

---

## References

- **Automerge**: https://docs.rs/automerge/latest/automerge/
- **Jupyter Protocol**: https://jupyter-client.readthedocs.io/en/stable/messaging.html
- **Axum**: https://github.com/tokio-rs/axum
- **CRDTs**: Shapiro et al., "A comprehensive study of Convergent and Commutative Replicated Data Types"
- **Operational Transform**: Ellis & Gibbs, "Concurrency Control in Groupware Systems"

