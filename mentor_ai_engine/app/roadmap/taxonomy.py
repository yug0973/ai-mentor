# Known tech skill taxonomy — passed into prompts so topic generation stays
# constrained to real, recognizable tech categories instead of fully
# open-ended (and more hallucination-prone) generation.
#
# This is deliberately a guide, not a hard enum on the model — RoadmapTopic
# titles are still free text (schema is frozen, see API_CONTRACT.md), but
# steering the model toward these categories keeps output consistent across
# domains and gives Phase 4 (Adaptive Roadmap) predictable topic shapes to
# reason about later.

TECH_SKILL_TAXONOMY = {
    "dsa": [
        "arrays & strings", "linked lists", "stacks & queues", "trees",
        "graphs", "recursion & backtracking", "dynamic programming",
        "sorting & searching", "hashing", "complexity analysis",
    ],
    "languages": [
        "python", "javascript", "typescript", "java", "c++", "go", "sql",
    ],
    "web_frameworks": [
        "html/css fundamentals", "react", "next.js", "node.js/express",
        "django", "flask", "fastapi", "rest api design", "graphql",
    ],
    "mobile": [
        "flutter", "android (kotlin)", "ios (swift)", "react native",
    ],
    "ml": [
        "python for ml", "numpy/pandas", "statistics fundamentals",
        "supervised learning", "unsupervised learning", "neural networks",
        "model evaluation", "deep learning frameworks",
    ],
    "system_design": [
        "scalability basics", "caching", "load balancing", "microservices",
        "message queues", "api gateway patterns", "system design interviews",
    ],
    "databases": [
        "relational db design", "sql querying", "indexing & optimization",
        "nosql (mongodb/redis)", "orm usage", "transactions",
    ],
    "devops": [
        "git & version control", "docker", "ci/cd", "kubernetes basics",
        "cloud fundamentals (aws/gcp/azure)", "linux & shell scripting",
        "monitoring & logging",
    ],
}


def taxonomy_prompt_block() -> str:
    """Render the taxonomy as a compact bullet list for prompt injection."""
    lines = []
    for category, items in TECH_SKILL_TAXONOMY.items():
        lines.append(f"- {category.replace('_', ' ')}: {', '.join(items)}")
    return "\n".join(lines)
