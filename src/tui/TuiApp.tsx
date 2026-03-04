import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import React, { useEffect, useState, useRef } from "react";
import { WorkflowRunner } from "./services/workflow-runner";

// Componente para visualizar bloques de progreso minimalistas
function ProgressBar({
	current,
	total,
	width = 30,
}: { current: number; total: number; width?: number }) {
	const filled = Math.round((current / total) * width);
	const empty = width - filled;
	const bar = "█".repeat(filled) + " ".repeat(empty);
	const percent = Math.round((current / total) * 100);

	return (
		<box flexDirection="column" gap={0}>
			<box flexDirection="row" justifyContent="space-between">
				<text color="gray">Progreso</text>
				<text color="cyan" bold>{percent}%</text>
			</box>
			<box borderStyle="rounded" borderColor="gray" padding={0} width={width + 2}>
				<text color="cyan">{bar}</text>
			</box>
		</box>
	);
}

interface LogItem {
	id: string;
	message: string;
}

interface ErrorItem {
	id: string;
	title: string;
	error: string;
}

interface EditionStatus {
	type: "page" | "cache";
	state: "searching" | "found" | "empty";
	count?: number;
}

type Mode = "normal" | "insert";

function App() {
	const [blogId, setBlogId] = useState("");
	const [isRunning, setIsRunning] = useState(false);
	const [logs, setLogs] = useState<LogItem[]>([]);
	const [progress, setProgress] = useState({
		current: 0,
		total: 0,
		currentBook: "",
	});
	const [editionStatus, setEditionStatus] = useState<EditionStatus | null>(null);
	const [errors, setErrors] = useState<ErrorItem[]>([]);
	const [doneStats, setDoneStats] = useState<{
		reportPath: string;
		stats: { total: number; withEditions: number };
	} | null>(null);
	
	const [mode, setMode] = useState<Mode>("normal");

	const runnerRef = useRef<WorkflowRunner | null>(null);
	const renderer = useRenderer();

	useEffect(() => {
		runnerRef.current = new WorkflowRunner();
		const runner = runnerRef.current;

		const handleLog = (msg: string) => {
			const newLog: LogItem = {
				id: Math.random().toString(36).substr(2, 9),
				message: msg,
			};
			setLogs((prev) => [...prev.slice(-15), newLog]);
		};

		const handleProgress = (
			current: number,
			total: number,
			currentBookTitle: string,
		) => {
			setProgress({ current, total, currentBook: currentBookTitle });
			setEditionStatus(null);
		};

		const handleEdition = (status: EditionStatus) => {
			setEditionStatus(status);
		};

		const handleError = (err: ErrorItem) => {
			setErrors((prev) => [...prev, err]);
		};

		const handleDone = (
			reportPath: string,
			stats: { total: number; withEditions: number },
		) => {
			setIsRunning(false);
			setDoneStats({ reportPath, stats });
		};

		const handleFatal = (msg: string) => {
			setIsRunning(false);
			handleLog(`❌ ${msg}`);
		};

		runner.on("log", handleLog);
		runner.on("progress", handleProgress);
		runner.on("edition-search", handleEdition);
		runner.on("error", handleError);
		runner.on("done", handleDone);
		runner.on("fatal", handleFatal);

		return () => {
			runner.stop();
			runner.removeAllListeners();
		};
	}, []);

	const startWorkflow = () => {
		if (!blogId) return;
		setIsRunning(true);
		setLogs([]);
		setErrors([]);
		setDoneStats(null);
		setProgress({ current: 0, total: 0, currentBook: "" });
		setMode("normal");
		
		setTimeout(() => {
			runnerRef.current?.start(blogId).catch(() => setIsRunning(false));
		}, 100);
	};

	const exitApp = () => {
		runnerRef.current?.stop();
		renderer.destroy();
		process.exit(0);
	};

	useKeyboard((key) => {
		if (mode === "normal") {
			if (key.name === "q") exitApp();
			if (key.name === "i") setMode("insert");
		} else if (mode === "insert") {
			if (key.name === "escape") setMode("normal");
		}
		if (key.ctrl && key.name === "c") exitApp();
	});

	return (
		<box
			flexDirection="column"
			width="100%"
			height="100%"
			justifyContent="center"
			alignItems="center"
			padding={1}
		>
			{!isRunning && !doneStats ? (
				/* Pantalla Inicial Centrada y Minimalista */
				<box
					flexDirection="column"
					alignItems="center"
					borderStyle="rounded"
					borderColor="cyan"
					padding={2}
					width={50}
				>
					<text bold color="cyan" marginBottom={1}>GOODREADS WORKFLOW</text>
					
					<box flexDirection="row" marginBottom={1}>
						<text color="gray">ID </text>
						<box borderStyle="rounded" borderColor={mode === "insert" ? "cyan" : "gray"} paddingX={1} width={30}>
							<input
								value={blogId}
								onInput={setBlogId}
								onSubmit={startWorkflow}
								placeholder="Escribe el ID del blog..."
								focused={mode === "insert"}
							/>
						</box>
					</box>

					<box flexDirection="column" alignItems="center" marginTop={1}>
						<text color="#444444" italic>
							{mode === "normal" ? "[i] para escribir  •  [q] para salir" : "[ESC] para modo normal"}
						</text>
					</box>
				</box>
			) : (
				/* Dashboard Minimalista */
				<box flexDirection="column" width="100%" height="100%" gap={1}>
					<box flexDirection="row" justifyContent="space-between" marginBottom={1}>
						<text bold color="cyan">RUNNING WORKFLOW</text>
						<text color="gray">{mode.toUpperCase()} MODE</text>
					</box>

					<box flexDirection="row" gap={2} flexGrow={1}>
						{/* Estado Actual */}
						<box width="40%" flexDirection="column" gap={1}>
							<box borderStyle="rounded" borderColor="cyan" padding={1} title="Status">
								{progress.total > 0 ? (
									<box flexDirection="column" gap={1}>
										<text color="white" bold wrap="truncate">{progress.currentBook}</text>
										<ProgressBar current={progress.current} total={progress.total} width={30} />
										<box flexDirection="row" gap={1} marginTop={1}>
											<text color="gray">Ediciones:</text>
											{editionStatus ? (
												<text color={editionStatus.state === "found" ? "green" : "yellow"}>
													{editionStatus.state === "found" ? `✓ ${editionStatus.count}` : "Searching..."}
												</text>
											) : <text color="gray">...</text>}
										</box>
									</box>
								) : (
									<text color="gray">Inicializando...</text>
								)}
							</box>

							{doneStats && (
								<box borderStyle="rounded" borderColor="green" padding={1} title="Done">
									<text color="green" bold>Completado</text>
									<text color="white">Libros: {doneStats.stats.total}</text>
									<text color="white">Encontrados: {doneStats.stats.withEditions}</text>
								</box>
							)}

							{errors.length > 0 && (
								<box borderStyle="rounded" borderColor="red" padding={1} title="Errors" flexGrow={1}>
									{errors.slice(-3).map(err => (
										<text key={err.id} color="red" wrap="truncate">• {err.title}</text>
									))}
								</box>
							)}
						</box>

						{/* Logs */}
						<box borderStyle="rounded" borderColor="cyan" padding={1} title="Activity Log" flexGrow={1}>
							{logs.map(log => (
								<text key={log.id} color="gray" wrap="truncate">› {log.message}</text>
							))}
						</box>
					</box>

					<box justifyContent="flex-end">
						<text color="#444444">[q] quit • [ESC] normal mode</text>
					</box>
				</box>
			)}
		</box>
	);
}

async function start() {
	const renderer = await createCliRenderer({ exitOnCtrlC: false });
	createRoot(renderer).render(<App />);
}

if (import.meta.main) {
	start();
}