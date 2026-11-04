'use strict';
/**
 * Generates verified, valid PDF documents for the Java Full Stack Training Programme.
 * Runs with 0 external dependencies using standard PDF 1.4 syntax.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DATA_DIR = path.join(root, 'data');
const MATERIALS_DIR = path.join(DATA_DIR, 'materials');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');

function escapePdf(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildPdfBuffer({ title, subtitle, pages }) {
  const pageDefs = [];
  const totalPages = pages.length;

  pages.forEach((pageData, pIdx) => {
    let stream = '';

    // Document header bar
    stream += '0.96 0.97 0.98 rg\n0 790 595.28 52 re f\n';
    stream += '0.1 0.15 0.25 rg\n';
    stream += 'BT\n/F2 11 Tf\n50 812 Td\n(' + escapePdf('SATURN TECHNOLOGIES • TRAINING PROGRAMME') + ') Tj\nET\n';
    stream += '0.4 0.45 0.5 rg\n';
    stream += 'BT\n/F1 9 Tf\n430 812 Td\n(' + escapePdf('Online Reading Copy') + ') Tj\nET\n';

    // Page title block
    stream += '0.05 0.09 0.16 rg\n';
    stream += 'BT\n/F2 18 Tf\n50 755 Td\n(' + escapePdf(title) + ') Tj\nET\n';

    if (subtitle) {
      stream += '0.3 0.35 0.42 rg\n';
      stream += 'BT\n/F1 11 Tf\n50 735 Td\n(' + escapePdf(subtitle) + ') Tj\nET\n';
    }

    // Divider line
    stream += '0.82 0.85 0.9 RG\n1 w\n50 720 m 545 720 l S\n';

    // Page content sections
    let y = 690;
    (pageData.sections || []).forEach((sec) => {
      if (sec.heading) {
        stream += '0.05 0.1 0.2 rg\n';
        stream += 'BT\n/F2 13 Tf\n50 ' + y + ' Td\n(' + escapePdf(sec.heading) + ') Tj\nET\n';
        y -= 22;
      }
      (sec.paragraphs || []).forEach((p) => {
        stream += '0.2 0.25 0.3 rg\n';
        stream += 'BT\n/F1 10 Tf\n50 ' + y + ' Td\n(' + escapePdf(p) + ') Tj\nET\n';
        y -= 18;
      });
      y -= 14;
    });

    // Confidential footer
    stream += '0.85 0.88 0.92 RG\n0.8 w\n50 50 m 545 50 l S\n';
    stream += '0.5 0.55 0.6 rg\n';
    stream += 'BT\n/F1 8.5 Tf\n50 35 Td\n(' + escapePdf('© 2026 Saturn Technologies India Private Limited. All rights reserved. Online access only.') + ') Tj\nET\n';
    stream += 'BT\n/F2 8.5 Tf\n480 35 Td\n(' + escapePdf('Page ' + (pIdx + 1) + ' of ' + totalPages) + ') Tj\nET\n';

    pageDefs.push(stream);
  });

  let curObj = 5;
  const pageRefs = [];
  const contentDefs = [];

  pageDefs.forEach((stream) => {
    const pageId = curObj++;
    const contentId = curObj++;
    pageRefs.push(pageId);
    contentDefs.push({ pageId, contentId, stream });
  });

  const objCatalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const objPages = '2 0 obj\n<< /Type /Pages /Kids [' + pageRefs.map((id) => id + ' 0 R').join(' ') + '] /Count ' + pageRefs.length + ' >>\nendobj\n';
  const objFont1 = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  const objFont2 = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  const bodyParts = [objCatalog, objPages, objFont1, objFont2];

  contentDefs.forEach(({ pageId, contentId, stream }) => {
    const pageObj = pageId + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>\nendobj\n';
    const streamLen = Buffer.byteLength(stream, 'utf8');
    const contentObj = contentId + ' 0 obj\n<< /Length ' + streamLen + ' >>\nstream\n' + stream + 'endstream\nendobj\n';
    bodyParts.push(pageObj, contentObj);
  });

  const header = '%PDF-1.4\n';
  let offset = header.length;
  const offsets = [];

  bodyParts.forEach((part) => {
    offsets.push(offset);
    offset += Buffer.byteLength(part, 'utf8');
  });

  let xref = 'xref\n0 ' + (offsets.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach((off) => {
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  });

  const trailer = 'trailer\n<< /Size ' + (offsets.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + offset + '\n%%EOF\n';

  return Buffer.from(header + bodyParts.join('') + xref + trailer, 'utf8');
}

const MATERIALS = [
  {
    id: 'mat_syllabus_2026',
    courseId: 'java-full-stack',
    title: 'Java Full Stack Programme Syllabus & Study Roadmap',
    category: 'Curriculum & Roadmap',
    fileName: 'java-full-stack-syllabus.pdf',
    pageCount: 3,
    description: 'Comprehensive curriculum overview, module schedules, grading criteria, and capstone project requirements.',
    pages: [
      {
        sections: [
          {
            heading: '1. Programme Overview & Educational Objectives',
            paragraphs: [
              'The Java Full Stack Training Programme is an intensive industrial curriculum designed to bridge academic theory',
              'with real-world software engineering practices. Learners gain rigorous hands-on proficiency across backend development,',
              'relational database modeling, modern frontend architecture, and continuous deployment.'
            ]
          },
          {
            heading: '2. Learning Pathways & Weekly Breakdown',
            paragraphs: [
              '• Weeks 1 - 3: Core Java, OOP Architecture, Collections Framework, and Memory Profiling.',
              '• Weeks 4 - 6: Relational Database Modeling, Advanced SQL, JDBC, and Transaction Isolation.',
              '• Weeks 7 - 9: Spring Boot, RESTful Web Services, Spring Data JPA, and Enterprise Security.',
              '• Weeks 10 - 12: Modern Frontend Integration, Asynchronous APIs, Microservices, and Capstone Project.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '3. Technical Competencies & Toolchain',
            paragraphs: [
              'Core Languages: Java 17/21 (LTS), SQL (PostgreSQL / MySQL), HTML5, CSS3, Modern JavaScript (ES6+).',
              'Enterprise Frameworks: Spring Boot 3.x, Spring MVC, Spring Data JPA, Hibernate ORM.',
              'DevOps & Tooling: Git, GitHub, Maven/Gradle, Postman, Docker Fundamentals, CI/CD Pipeline Concepts.'
            ]
          },
          {
            heading: '4. Capstone Project Architecture',
            paragraphs: [
              'Learners will design and implement a distributed e-commerce / service platform featuring user authentication,',
              'catalog search, order processing, and payment gateway integration with end-to-end unit and integration test coverage.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '5. Assessment & Certification Criteria',
            paragraphs: [
              'Certification of completion requires minimum 85% attendance across all technical sessions, successful submission',
              'of all modular assignments, and a passing evaluation on the final capstone project defense before technical faculty.'
            ]
          },
          {
            heading: '6. Support & Mentor Office Hours',
            paragraphs: [
              'Dedicated mentor office hours are held weekly. Learners may submit technical queries directly through the student portal',
              'or schedule 1-on-1 code reviews with senior engineering instructors.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'mat_mod1_core_java',
    courseId: 'java-full-stack',
    title: 'Module 1: Core Java & Object-Oriented Programming',
    category: 'Core Java',
    fileName: 'module-1-core-java.pdf',
    pageCount: 3,
    description: 'OOP architecture, encapsulation, polymorphism, Java Collections framework, memory model, and concurrency.',
    pages: [
      {
        sections: [
          {
            heading: '1. Object-Oriented Principles in Java',
            paragraphs: [
              'Java enforces strict object-oriented modeling. Programs are decomposed into modular classes that encapsulate state',
              'and expose well-defined behavioral contracts via public methods and interfaces.',
              'Key principles: Encapsulation (data hiding), Abstraction (contracts over implementations),',
              'Inheritance (hierarchical reuse), and Polymorphism (dynamic dispatch at runtime).'
            ]
          },
          {
            heading: '2. The JVM Architecture & Memory Segments',
            paragraphs: [
              '• Heap Memory: Stores all objects and instance fields; governed by the Garbage Collector.',
              '• Stack Memory: Stores thread-specific call frames, local primitive variables, and object references.',
              '• Metaspace: Holds class metadata, bytecode definitions, and static variables.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '3. Java Collections Framework Deep Dive',
            paragraphs: [
              '• java.util.List: Ordered sequences allowing duplicate elements (ArrayList, LinkedList, Vector).',
              '• java.util.Set: Collections guaranteeing element uniqueness based on equals() and hashCode() (HashSet, TreeSet).',
              '• java.util.Map: Key-value associative structures (HashMap, ConcurrentHashMap, TreeMap).'
            ]
          },
          {
            heading: '4. Generics & Compile-Time Safety',
            paragraphs: [
              'Java Generics eliminate explicit casting and prevent ClassCastException at runtime via compile-time type checking',
              'and type erasure, ensuring full backward compatibility with legacy bytecode.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '5. Multithreading & Concurrency Fundamentals',
            paragraphs: [
              'Threads in Java represent independent execution paths within the same process memory space.',
              'Synchronization primitives, java.util.concurrent (ExecutorService, CountDownLatch, ConcurrentHashMap),',
              'and virtual threads (Project Loom) enable highly scalable concurrent processing.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'mat_mod2_databases_sql',
    courseId: 'java-full-stack',
    title: 'Module 2: Relational Databases & SQL Mastery',
    category: 'Databases & SQL',
    fileName: 'module-2-databases-sql.pdf',
    pageCount: 3,
    description: 'Relational schema design, normalization, complex joins, indexing strategies, JDBC, and transaction management.',
    pages: [
      {
        sections: [
          {
            heading: '1. Relational Database Modeling & Normalization',
            paragraphs: [
              'Relational models represent data entities as structured tables with rows (tuples) and columns (attributes).',
              'Normalization principles (1NF, 2NF, 3NF, BCNF) eliminate redundant data and prevent insertion, update,',
              'and deletion anomalies while maintaining relational integrity constraints.'
            ]
          },
          {
            heading: '2. Primary Keys, Foreign Keys & Referential Integrity',
            paragraphs: [
              'Primary keys uniquely identify rows within a table. Foreign keys establish relational dependencies between tables',
              'and enforce referential constraints with CASCADE, RESTRICT, and SET NULL delete rules.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '3. Advanced Querying with SQL',
            paragraphs: [
              'Mastery of INNER JOIN, LEFT OUTER JOIN, RIGHT OUTER JOIN, and FULL JOIN operations for combining multi-table datasets.',
              'Aggregation functions (COUNT, SUM, AVG, MIN, MAX) combined with GROUP BY and HAVING clauses.',
              'Subqueries, Common Table Expressions (WITH clauses), and Window Functions (ROW_NUMBER, RANK, DENSE_RANK).'
            ]
          },
          {
            heading: '4. Indexing & Query Optimization',
            paragraphs: [
              'B-Tree and Hash index structures significantly accelerate query execution times on frequently filtered columns.',
              'Understanding EXPLAIN execution plans, avoiding full table scans, and optimizing join ordering.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '5. Database Transactions & ACID Properties',
            paragraphs: [
              '• Atomicity: Entire transaction completes successfully or rolls back completely.',
              '• Consistency: Data transitions strictly between valid relational states.',
              '• Isolation: Concurrent transactions do not interfere; isolation levels: Read Committed, Repeatable Read, Serializable.',
              '• Durability: Committed transaction records persist permanently across system failures.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'mat_mod3_spring_boot',
    courseId: 'java-full-stack',
    title: 'Module 3: Spring Boot & Enterprise REST APIs',
    category: 'Backend Architecture',
    fileName: 'module-3-spring-boot.pdf',
    pageCount: 3,
    description: 'Spring Core, Dependency Injection, RESTful controller design, Spring Data JPA, Hibernate, and API security.',
    pages: [
      {
        sections: [
          {
            heading: '1. Spring Framework & Inversion of Control',
            paragraphs: [
              'Inversion of Control (IoC) delegates component lifecycle management and dependency resolution to the Spring container.',
              'Dependency Injection (DI) through constructor injection fosters loose coupling, testability, and modular architecture.',
              'Spring Boot automates configuration through opinionated starters and intelligent classpath auto-configuration.'
            ]
          },
          {
            heading: '2. RESTful Architecture & HTTP Methods',
            paragraphs: [
              'Design principles: Stateless communications, standard HTTP methods (GET, POST, PUT, PATCH, DELETE),',
              'semantic status codes (200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Error).',
              '@RestController, @RequestMapping, @PathVariable, @RequestParam, and @RequestBody annotations.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '3. Persistence with Spring Data JPA & Hibernate',
            paragraphs: [
              'Object-Relational Mapping (ORM) maps Java entity classes directly to database tables using JPA annotations (@Entity, @Table).',
              'Spring Data JpaRepository provides out-of-the-box CRUD operations, pagination, sorting, and dynamic query derivation.',
              'Managing relationship mappings: @OneToOne, @OneToMany, @ManyToOne, @ManyToMany, and avoiding N+1 select queries.'
            ]
          },
          {
            heading: '4. Input Validation & Global Exception Handling',
            paragraphs: [
              'Declarative validation with Jakarta Bean Validation (@NotNull, @Size, @Email, @Min, @Max).',
              'Centralized exception interception using @ControllerAdvice and @ExceptionHandler returning standardized error payloads.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '5. Enterprise Security & Authentication',
            paragraphs: [
              'Spring Security filter chain architecture, stateless authentication with JSON Web Tokens (JWT),',
              'role-based access control (RBAC) with @PreAuthorize annotations, and protection against CSRF and injection attacks.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'mat_mod4_frontend',
    courseId: 'java-full-stack',
    title: 'Module 4: Modern Web Frontend & Full-Stack Integration',
    category: 'Full Stack Integration',
    fileName: 'module-4-frontend-integration.pdf',
    pageCount: 3,
    description: 'Modern responsive UI, DOM manipulation, asynchronous Fetch API integration, state management, and capstone deployment.',
    pages: [
      {
        sections: [
          {
            heading: '1. Modern Web Standards: Semantic HTML5 & CSS3',
            paragraphs: [
              'Semantic HTML structure (<main>, <section>, <article>, <header>, <nav>) enhances accessibility and search indexing.',
              'Responsive design using CSS Flexbox, Grid, custom properties (CSS variables), and fluid media queries.',
              'Clean separation of concerns between structure, presentation, and interactive behavior.'
            ]
          },
          {
            heading: '2. Modern JavaScript & Asynchronous Programming',
            paragraphs: [
              'ECMAScript modern standards: const/let block scoping, arrow functions, destructuring, modules, and template literals.',
              'Asynchronous execution model: Event loop, microtask queue, Promises, and async/await syntax for clean non-blocking code.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '3. Connecting Frontend to Backend REST Services',
            paragraphs: [
              'Consuming Spring Boot REST endpoints using the native Fetch API with JSON request and response payloads.',
              'Managing authentication tokens in browser storage (Bearer tokens), handling 401/403 session expiration,',
              'and displaying friendly user feedback states (loading spinners, error alerts, success confirmations).'
            ]
          },
          {
            heading: '4. Cross-Origin Resource Sharing (CORS)',
            paragraphs: [
              'Understanding browser same-origin policy security rules, preflight OPTIONS requests, and configuring Spring Boot',
              'CORS headers (@CrossOrigin or WebMvcConfigurer) to permit authorized client domains.'
            ]
          }
        ]
      },
      {
        sections: [
          {
            heading: '5. Production Deployment & Cloud Hosting',
            paragraphs: [
              'Building production-ready frontend bundles and Spring Boot executable JAR artifacts.',
              'Containerization with Docker, configuring environment variables for production database credentials,',
              'and deploying full stack web applications on modern cloud infrastructure.'
            ]
          }
        ]
      }
    ]
  }
];

function generateAllMaterials() {
  if (!fs.existsSync(MATERIALS_DIR)) {
    fs.mkdirSync(MATERIALS_DIR, { recursive: true });
  }

  const manifest = [];

  MATERIALS.forEach((mat) => {
    const pdfBuffer = buildPdfBuffer({
      title: mat.title,
      subtitle: 'Java Full Stack Training Programme • Saturn Technologies',
      pages: mat.pages
    });

    const targetFile = path.join(MATERIALS_DIR, mat.fileName);
    fs.writeFileSync(targetFile, pdfBuffer);

    const stat = fs.statSync(targetFile);
    const sizeKb = Math.round(stat.size / 1024);

    manifest.push({
      id: mat.id,
      courseId: mat.courseId,
      title: mat.title,
      category: mat.category,
      description: mat.description,
      fileName: mat.fileName,
      fileSize: sizeKb > 0 ? sizeKb + ' KB' : stat.size + ' B',
      pageCount: mat.pageCount,
      updatedAt: new Date().toISOString()
    });
  });

  fs.writeFileSync(MATERIALS_FILE, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Generated ${manifest.length} course material PDFs into ${MATERIALS_DIR}`);
  return manifest;
}

if (require.main === module) {
  generateAllMaterials();
}

module.exports = {
  generateAllMaterials,
  MATERIALS
};
