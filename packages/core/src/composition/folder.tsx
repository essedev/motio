import { type ReactNode, useContext, useMemo } from "react";
import { FolderContext } from "../timeline/contexts.js";
import { validateFolderName } from "./validate.js";

/** Props of `<Folder>`. */
export interface FolderProps {
	/** Folder name: letters, digits, CJK characters and "-". */
	name: string;
	children?: ReactNode;
}

/** Groups compositions in an editor's list. Folders nest and have no effect on rendering. */
export function Folder({ name, children }: FolderProps): ReactNode {
	validateFolderName(name);
	const parent = useContext(FolderContext);
	const value = useMemo(
		() => ({ name, path: parent ? `${parent.path}/${name}` : name }),
		[name, parent],
	);
	return <FolderContext.Provider value={value}>{children}</FolderContext.Provider>;
}
