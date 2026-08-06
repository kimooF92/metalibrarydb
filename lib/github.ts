/**
 * Helper to dispatch GitHub Action workflows via GitHub API when jobs are created
 */
export async function triggerGitHubWorkflow(
  workflowFileName: string,
  inputs?: Record<string, string>
): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // Format: "owner/repo"

  if (!token || !repo) {
    return false;
  }

  try {
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowFileName}/dispatches`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.GITHUB_REF_NAME || "main",
        inputs: inputs || {},
      }),
    });

    return res.ok;
  } catch (error) {
    console.error("Failed to trigger GitHub workflow:", error);
    return false;
  }
}
