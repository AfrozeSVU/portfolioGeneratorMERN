import fs from "fs-extra";
import path from "path";
import { exec, execSync } from "child_process";
import axios from "axios";
import dotenv from "dotenv";
export const generatePortfolio = async (templatePath, outputPath, userData) => {
  console.log("Generating portfolio at:", outputPath);
  try {
    // Step 1: Copy the template to the output path
    await fs.copy(templatePath, outputPath);

    // Step 2: Replace placeholders and convert .ejs to .jsx
    const processEjsFiles = async (dirPath) => {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);

        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          // Recursively process subdirectories
          await processEjsFiles(filePath);
        } else if (path.extname(file) === ".ejs") {
          // Read the .ejs file
          let fileContent = await fs.readFile(filePath, "utf-8");

          // Replace placeholders with userData
          fileContent = fileContent
            .replace(/{name}/g, userData.name || "Default Name")
            .replace(/{about}/g, userData.about || "Default About Text")
            .replace(
              /{experience}/g,
              userData.experience || "Default Experience"
            )
            .replace(/{skills}/g, userData.skills || "Default Skills");

          // Rename the file to .jsx
          const newFilePath = filePath.replace(/\.ejs$/, ".jsx");

          // Write the updated content back to the renamed file
          await fs.writeFile(newFilePath, fileContent, "utf-8");

          // Delete the old .ejs file
          await fs.unlink(filePath);
        }
      }
    };

    await processEjsFiles(outputPath);

    // Step 3: Update App.jsx to pass userData to all sections
    const appFilePath = path.join(outputPath, "src", "App.jsx");
    let appContent = await fs.readFile(appFilePath, "utf-8");
    const updatedAppContent = appContent
      .replace(`const App = () => {`, `const App = ({ userData }) => {`)
      .replace(`<Hero />`, `<Hero userData={userData} />`)
      .replace(`<About />`, `<About userData={userData} />`)
      .replace(`<Navbar />`, `<Navbar userData={userData} />`)
      .replace(`<Projects />`, `<Projects userData={userData} />`)
      .replace(`<Clients />`, `<Clients userData={userData} />`)
      .replace(`<WorkExperience />`, `<WorkExperience userData={userData} />`)
      .replace(`<Contact />`, `<Contact userData={userData} />`)
      .replace(`<Footer />`, `<Footer userData={userData} />`);
    await fs.writeFile(appFilePath, updatedAppContent, "utf-8");

    // Step 4: Inject userData into main.jsx
    const mainFilePath = path.join(outputPath, "src", "main.jsx");
    let mainContent = await fs.readFile(mainFilePath, "utf-8");
    const updatedMainContent = mainContent.replace(
      `<App />`,
      `<App userData={${JSON.stringify(userData)}} />`
    );
    await fs.writeFile(mainFilePath, updatedMainContent, "utf-8");

    console.log("Portfolio generated successfully!");
  } catch (err) {
    console.error("Error generating portfolio:", err);
  }
};

export const runGeneratedPortfolio = async (
  templatePath,
  outputPath,
  port = 5000,
  devMode = false // Toggle for running in development or production mode
) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (devMode) {
        // Start the Vite development server
        console.log("Starting the development server...");
        const devCommand = "npm run dev";
        const devProcess = exec(devCommand, { cwd: outputPath }, (error) => {
          if (error) {
            console.error("Error running the development server:", error);
            return reject(error);
          }
        });

        // Log server output
        devProcess.stdout.on("data", (data) => console.log(data));
        devProcess.stderr.on("data", (data) => console.error(data));

        setTimeout(() => {
          const url = `http://localhost:${port}`;
          console.log(`Development server is running at: ${url}`);
          resolve(url);
        }, 3000); // Give time for the server to start
      } else {
        // Build the project
        console.log("Building the project for production...");
        try {
          await new Promise((resolve, reject) => {
            const buildCommand = "npm run build";
            const buildProcess = exec(
              buildCommand,
              { cwd: outputPath },
              (error) => {
                if (error) {
                  console.error("Error during build:", error);
                  return reject(error);
                }
                resolve();
              }
            );

            buildProcess.stdout.on("data", (data) => console.log(data));
            buildProcess.stderr.on("data", (data) => console.error(data));
          });
        } catch (buildError) {
          console.error("Failed to build the project:", buildError);
          return reject(buildError);
        }

        // Run the built project using Vite preview
        console.log("Previewing the production build...");
        const previewCommand = `npx vite preview --port ${port}`;
        const previewProcess = exec(
          previewCommand,
          { cwd: outputPath },
          (error) => {
            if (error) {
              console.error("Error running the preview server:", error);
              return reject(error);
            }
          }
        );

        // Log server output
        previewProcess.stdout.on("data", (data) => console.log(data));
        previewProcess.stderr.on("data", (data) => console.error(data));

        setTimeout(() => {
          const url = `http://localhost:${port}`;
          console.log(`Production preview is running at: ${url}`);
          resolve(url);
        }, 3000); // Give time for the server to start
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      reject(err);
    }
  });
};

// Function to create a GitHub repository
async function createGitHubRepo({
  repoName,
  accessToken,
  description = "",
  isPrivate = false,
}) {
  try {
    const apiUrl = "https://api.github.com/user/repos";

    console.log(`Creating repository: ${repoName}...`);

    // Make POST request to GitHub API
    const response = await axios.post(
      apiUrl,
      {
        name: repoName,
        description,
        private: isPrivate,
      },
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    console.log("Repository created successfully:", response.data.html_url);

    return response.data.clone_url; // Return the repository's clone URL
  } catch (error) {
    console.error("Error creating repository:", error.response.data.message);
    throw error;
  }
}

function pushToGitHub({ repoUrl, projectPath, branch = "main" }) {
  try {
    console.log("Starting the deployment process...");

    // Step 1: Initialize Git if not already initialized
    if (!fs.existsSync(`${projectPath}/.git`)) {
      console.log("Initializing Git...");
      execSync("git init", { cwd: projectPath });
    }

    // Step 2: Add all files to staging area
    console.log("Adding files to Git...");
    execSync("git add .", { cwd: projectPath });

    // Step 3: Commit changes
    console.log("Committing changes...");
    execSync('git commit -m "Initial commit"', { cwd: projectPath });

    let remoteExists;
    try {
      // Check if remote origin exists
      execSync("git remote get-url origin", { cwd: projectPath });
      remoteExists = true;
    } catch (error) {
      remoteExists = false; // If an error occurs, the remote does not exist
    }

    if (remoteExists) {
      // Step 4: Update remote URL if it exists
      console.log("Updating remote repository URL...");
      execSync(`git remote set-url origin ${repoUrl}`, { cwd: projectPath });
    } else {
      // Step 4: Add remote if it doesn't exist
      console.log("Adding remote repository...");
      execSync(`git remote add origin ${repoUrl}`, { cwd: projectPath });
    }

    // Step 5: Set the correct branch name and push code
    console.log(`Ensuring branch ${branch} exists...`);
    execSync(`git branch -M ${branch}`, { cwd: projectPath }); // Rename branch to 'main' or provided branch name if not already done

    // Step 6: Push to the remote repository
    console.log(`Pushing code to branch: ${branch}...`);
    execSync(`git push -u origin ${branch}`, { cwd: projectPath });

    console.log("Code pushed successfully!");
  } catch (error) {
    console.error("Error during deployment:", error.message);
  }
}

async function enableGitHubPages({ repoName, accessToken, branch = "main" }) {
  try {
    console.log(`Starting deployment for repository: ${repoName}...`);

    // Step 1: Build the Project
    console.log("Building the project...");
    await runCommand("npm run build");

    // Step 2: Deploy to GitHub Pages
    console.log("Deploying to GitHub Pages...");
    await runCommand("npm run deploy");

    // Step 3: Enable GitHub Pages via API
    console.log("Enabling GitHub Pages...");
    const apiUrl = `https://api.github.com/repos/${repoName}/pages`;

    const response = await axios.post(
      apiUrl,
      {
        source: {
          branch: branch,
          path: "/",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    console.log(
      `GitHub Pages successfully enabled! Your site will be available at: ${response.data.html_url}`
    );

    return response.data.html_url; // Return the GitHub Pages URL
  } catch (error) {
    console.error(
      "Error enabling GitHub Pages:",
      error.response?.data?.message || error.message
    );
    throw error;
  }
}

// Helper function to execute shell commands
function runCommand(command) {
  return new Promise((resolve, reject) => {
    const process = exec(command);

    process.stdout.on("data", (data) => {
      console.log(data.toString());
    });

    process.stderr.on("data", (data) => {
      console.error(data.toString());
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}
// Main function to create and deploy the repository
export async function deployPortfolio(projectPath, userName) {
  const repoName = userName; // Your desired repository name
  const accessToken = process.env.GIT_ACCESS_TOKEN; // Replace with your GitHub PAT

  try {
    // Step 1: Create GitHub repository
    const repoUrl = await createGitHubRepo({
      repoName,
      accessToken,
      description: "This is my portfolio website",
      isPrivate: false,
    });

    // Step 2: Push project files to the repository
    pushToGitHub({ repoUrl, projectPath });
    await enableGitHubPages({ repoName, accessToken });
    console.log(`Your portfolio is live at: https://${repoName}.github.io`);
  } catch (error) {
    console.error("Deployment failed:", error.message);
  }
}

// Run the script
