# mangenehm.github.io

A collection of useful web tools hosted on GitHub Pages.

## How It Works

This repository hosts a static website that serves as a curated collection of web-based tools. The site automatically generates an index page that displays all available tools in a responsive grid layout.

### Repository Structure

```
mangenehm.github.io/
├── index.html                  # Auto-generated main page (DO NOT EDIT MANUALLY)
├── CNAME                       # Custom domain configuration
├── scripts/
│   ├── generate-index.py       # Python script to generate index.html
│   └── template.html           # HTML template for the index page
├── tools/                      # Directory containing all tools
│   ├── counter/
│   │   ├── tool.json          # Tool metadata
│   │   └── index.html         # Tool implementation
│   ├── budgetrechner/
│   ├── eckenabrunder/
│   ├── flip7counter/
│   └── fortschrittsbalken/
└── .github/
    └── workflows/
        └── update-index.yml    # GitHub Actions workflow
```

### How the Index Generation Works

1. The `scripts/generate-index.py` script scans all subdirectories in `tools/`
2. For each tool directory, it reads the `tool.json` file to get metadata
3. It validates that required files (`tool.json` and `index.html`) exist
4. It generates HTML cards for each tool using the metadata
5. It inserts the generated cards into `scripts/template.html`
6. The final output is saved as `index.html` in the root directory

The GitHub Actions workflow (`.github/workflows/update-index.yml`) automatically runs the generation script whenever:
- A `tool.json` or `index.html` file is pushed to any tool directory
- Files in the `scripts/` directory are modified
- Manually triggered via workflow dispatch

## Publishing a New Tool

Follow these steps to add a new tool to the collection:

### 1. Create a New Tool Directory

Create a new directory under `tools/` with a descriptive name (use lowercase and hyphens):

```bash
mkdir tools/my-new-tool
```

### 2. Create the tool.json Metadata File

Create a `tool.json` file in your tool directory with the following structure:

```json
{
    "name": "My New Tool",
    "description": "A brief description of what this tool does.",
    "category": "Category Name",
    "tags": ["tag1", "tag2"],
    "created": "2025-12-11",
    "lastUpdated": "2025-12-11"
}
```

**Required fields:**
- `name`: The display name of your tool
- `description`: A short description (1-2 sentences)
- `tags`: Array of tags for categorization

**Optional fields:**
- `category`: Category for grouping (defaults to "Sonstige")
- `created`: Creation date in YYYY-MM-DD format
- `lastUpdated`: Last update date in YYYY-MM-DD format

### 3. Create the Tool Implementation

Create an `index.html` file in your tool directory with your tool's implementation:

```bash
tools/my-new-tool/index.html
```

This file should be a complete HTML page with your tool's functionality.

### 4. Test Locally (Optional)

You can test the index generation locally:

```bash
python scripts/generate-index.py
```

This will regenerate the `index.html` file. Open it in a browser to verify your tool appears correctly.

### 5. Commit and Push

```bash
git add tools/my-new-tool/
git commit -m "Add new tool: My New Tool"
git push origin main
```

### 6. Automatic Deployment

The GitHub Actions workflow will automatically:
1. Detect the changes to `tools/*/tool.json` or `tools/*/index.html`
2. Run the `generate-index.py` script
3. Commit the updated `index.html`
4. Deploy to GitHub Pages

Your tool will be live within a few minutes!

## Updating an Existing Tool

To update an existing tool:

1. Modify the tool's `index.html` and/or `tool.json`
2. Update the `lastUpdated` field in `tool.json`
3. Commit and push the changes
4. The index will regenerate automatically

## Manual Index Regeneration

If you need to manually trigger the index regeneration:

1. Go to the "Actions" tab in the GitHub repository
2. Click on "Update Tools Index" workflow
3. Click "Run workflow"

Or run locally:

```bash
python scripts/generate-index.py
git add index.html
git commit -m "Update tools index"
git push
```

## Tool Validation

The generator script validates each tool directory to ensure:
- `tool.json` exists and is valid JSON
- `index.html` exists
- Required fields (`name`, `description`, `tags`) are present in `tool.json`

If validation fails, the tool will be skipped and a warning will be logged.

## Customization

### Modifying the Index Page Design

To change the appearance of the index page:
1. Edit `scripts/template.html`
2. Commit and push the changes
3. The workflow will regenerate `index.html` with the new template

### Adding Custom Styles

The template includes CSS variables for easy theming:

```css
:root {
    --primary-color: #0066cc;
    --background-color: #f5f5f5;
    --card-background: #ffffff;
    --text-color: #333333;
    --tag-background: #e9ecef;
}
```

## Troubleshooting

**Tool not appearing on the index page:**
- Verify `tool.json` and `index.html` exist in the tool directory
- Check that `tool.json` is valid JSON and contains required fields
- Check the GitHub Actions logs for validation errors

**Index not updating after push:**
- Verify the GitHub Actions workflow ran successfully
- Check that you modified files matching the workflow triggers
- Manually trigger the workflow if needed

**Local generation not working:**
- Ensure Python 3.x is installed
- Run from the repository root directory
- Check that `scripts/template.html` exists

## License

This project is open source and available for personal use.
