/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/actions';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IEditorGroupsService, GroupOrientation } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { getMenuBarVisibility } from 'vs/platform/windows/common/windows';
import { isWindows, isLinux, isWeb } from 'vs/base/common/platform';
import { IsMacNativeContext } from 'vs/workbench/browser/contextkeys';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { InEditorZenModeContext, IsCenteredLayoutContext, EditorAreaVisibleContext } from 'vs/workbench/common/editor';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { SideBarVisibleContext } from 'vs/workbench/common/viewlet';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IViewDescriptorService, IViewContainersRegistry, Extensions as ViewContainerExtensions, IViewsService, FocusedViewContext, ViewContainerLocation } from 'vs/workbench/common/views';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IActivityBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';

const registry = Registry.as<IWorkbenchActionRegistry>(WorkbenchExtensions.WorkbenchActions);
const viewCategory = nls.localize('view', "View");

// --- Close Side Bar

export class CloseSidebarAction extends Action {

	static readonly ID = 'workbench.action.closeSidebar';
	static readonly LABEL = nls.localize('closeSidebar', "Close Side Bar");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);

		this.enabled = !!this.layoutService;
	}

	async run(): Promise<void> {
		this.layoutService.setSideBarHidden(true);
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(CloseSidebarAction, CloseSidebarAction.ID, CloseSidebarAction.LABEL), 'View: Close Side Bar ', viewCategory);

// --- Toggle Activity Bar

export class ToggleActivityBarVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleActivityBarVisibility';
	static readonly LABEL = nls.localize('toggleActivityBar', "Toggle Activity Bar Visibility");

	private static readonly activityBarVisibleKey = 'workbench.activityBar.visible';

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);

		this.enabled = !!this.layoutService;
	}

	run(): Promise<void> {
		const visibility = this.layoutService.isVisible(Parts.ACTIVITYBAR_PART);
		const newVisibilityValue = !visibility;

		return this.configurationService.updateValue(ToggleActivityBarVisibilityAction.activityBarVisibleKey, newVisibilityValue, ConfigurationTarget.USER);
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleActivityBarVisibilityAction, ToggleActivityBarVisibilityAction.ID, ToggleActivityBarVisibilityAction.LABEL), 'View: Toggle Activity Bar Visibility', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleActivityBarVisibilityAction.ID,
		title: nls.localize({ key: 'miShowActivityBar', comment: ['&& denotes a mnemonic'] }, "Show &&Activity Bar"),
		toggled: ContextKeyExpr.equals('config.workbench.activityBar.visible', true)
	},
	order: 4
});

// --- Toggle Centered Layout

class ToggleCenteredLayout extends Action {

	static readonly ID = 'workbench.action.toggleCenteredLayout';
	static readonly LABEL = nls.localize('toggleCenteredLayout', "Toggle Centered Layout");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
		this.enabled = !!this.layoutService;
	}

	async run(): Promise<void> {
		this.layoutService.centerEditorLayout(!this.layoutService.isEditorLayoutCentered());
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleCenteredLayout, ToggleCenteredLayout.ID, ToggleCenteredLayout.LABEL), 'View: Toggle Centered Layout', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleCenteredLayout.ID,
		title: nls.localize('miToggleCenteredLayout', "Centered Layout"),
		toggled: IsCenteredLayoutContext
	},
	order: 3
});

// --- Toggle Editor Layout

export class ToggleEditorLayoutAction extends Action {

	static readonly ID = 'workbench.action.toggleEditorGroupLayout';
	static readonly LABEL = nls.localize('flipLayout', "Toggle Vertical/Horizontal Editor Layout");

	private readonly toDispose = this._register(new DisposableStore());

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);

		this.class = 'codicon-editor-layout';
		this.updateEnablement();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.add(this.editorGroupService.onDidAddGroup(() => this.updateEnablement()));
		this.toDispose.add(this.editorGroupService.onDidRemoveGroup(() => this.updateEnablement()));
	}

	private updateEnablement(): void {
		this.enabled = this.editorGroupService.count > 1;
	}

	async run(): Promise<void> {
		const newOrientation = (this.editorGroupService.orientation === GroupOrientation.VERTICAL) ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
		this.editorGroupService.setGroupOrientation(newOrientation);
	}
}

const group = viewCategory;
registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_0, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_0 } }), 'View: Toggle Vertical/Horizontal Editor Layout', group);

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: 'z_flip',
	command: {
		id: ToggleEditorLayoutAction.ID,
		title: nls.localize({ key: 'miToggleEditorLayout', comment: ['&& denotes a mnemonic'] }, "Flip &&Layout")
	},
	order: 1
});

// --- Toggle Sidebar Position

export class ToggleSidebarPositionAction extends Action {

	static readonly ID = 'workbench.action.toggleSidebarPosition';
	static readonly LABEL = nls.localize('toggleSidebarPosition', "Toggle Side Bar Position");

	private static readonly sidebarPositionConfigurationKey = 'workbench.sideBar.location';

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);

		this.enabled = !!this.layoutService && !!this.configurationService;
	}

	run(): Promise<void> {
		const position = this.layoutService.getSideBarPosition();
		const newPositionValue = (position === Position.LEFT) ? 'right' : 'left';

		return this.configurationService.updateValue(ToggleSidebarPositionAction.sidebarPositionConfigurationKey, newPositionValue, ConfigurationTarget.USER);
	}

	static getLabel(layoutService: IWorkbenchLayoutService): string {
		return layoutService.getSideBarPosition() === Position.LEFT ? nls.localize('moveSidebarRight', "Move Side Bar Right") : nls.localize('moveSidebarLeft', "Move Side Bar Left");
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleSidebarPositionAction, ToggleSidebarPositionAction.ID, ToggleSidebarPositionAction.LABEL), 'View: Toggle Side Bar Position', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '3_workbench_layout_move',
	command: {
		id: ToggleSidebarPositionAction.ID,
		title: nls.localize({ key: 'miMoveSidebarRight', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Right")
	},
	when: ContextKeyExpr.notEquals('config.workbench.sideBar.location', 'right'),
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '3_workbench_layout_move',
	command: {
		id: ToggleSidebarPositionAction.ID,
		title: nls.localize({ key: 'miMoveSidebarLeft', comment: ['&& denotes a mnemonic'] }, "&&Move Side Bar Left")
	},
	when: ContextKeyExpr.equals('config.workbench.sideBar.location', 'right'),
	order: 2
});

// --- Toggle Sidebar Visibility

export class ToggleEditorVisibilityAction extends Action {
	static readonly ID = 'workbench.action.toggleEditorVisibility';
	static readonly LABEL = nls.localize('toggleEditor', "Toggle Editor Area");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);

		this.enabled = !!this.layoutService;
	}

	async run(): Promise<void> {
		this.layoutService.toggleMaximizedPanel();
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleEditorVisibilityAction, ToggleEditorVisibilityAction.ID, ToggleEditorVisibilityAction.LABEL), 'View: Toggle Editor Area Visibility', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleEditorVisibilityAction.ID,
		title: nls.localize({ key: 'miShowEditorArea', comment: ['&& denotes a mnemonic'] }, "Show &&Editor Area"),
		toggled: EditorAreaVisibleContext
	},
	order: 5
});

export class ToggleSidebarVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleSidebarVisibility';
	static readonly LABEL = nls.localize('toggleSidebar', "Toggle Side Bar Visibility");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);

		this.enabled = !!this.layoutService;
	}

	async run(): Promise<void> {
		const hideSidebar = this.layoutService.isVisible(Parts.SIDEBAR_PART);
		this.layoutService.setSideBarHidden(hideSidebar);
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleSidebarVisibilityAction, ToggleSidebarVisibilityAction.ID, ToggleSidebarVisibilityAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_B }), 'View: Toggle Side Bar Visibility', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '2_appearance',
	title: nls.localize({ key: 'miAppearance', comment: ['&& denotes a mnemonic'] }, "&&Appearance"),
	submenu: MenuId.MenubarAppearanceMenu,
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleSidebarVisibilityAction.ID,
		title: nls.localize({ key: 'miShowSidebar', comment: ['&& denotes a mnemonic'] }, "Show &&Side Bar"),
		toggled: SideBarVisibleContext
	},
	order: 1
});

// --- Toggle Statusbar Visibility

export class ToggleStatusbarVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleStatusbarVisibility';
	static readonly LABEL = nls.localize('toggleStatusbar', "Toggle Status Bar Visibility");

	private static readonly statusbarVisibleKey = 'workbench.statusBar.visible';

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);

		this.enabled = !!this.layoutService;
	}

	run(): Promise<void> {
		const visibility = this.layoutService.isVisible(Parts.STATUSBAR_PART);
		const newVisibilityValue = !visibility;

		return this.configurationService.updateValue(ToggleStatusbarVisibilityAction.statusbarVisibleKey, newVisibilityValue, ConfigurationTarget.USER);
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleStatusbarVisibilityAction, ToggleStatusbarVisibilityAction.ID, ToggleStatusbarVisibilityAction.LABEL), 'View: Toggle Status Bar Visibility', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleStatusbarVisibilityAction.ID,
		title: nls.localize({ key: 'miShowStatusbar', comment: ['&& denotes a mnemonic'] }, "Show S&&tatus Bar"),
		toggled: ContextKeyExpr.equals('config.workbench.statusBar.visible', true)
	},
	order: 3
});

// --- Toggle Tabs Visibility

class ToggleTabsVisibilityAction extends Action {

	static readonly ID = 'workbench.action.toggleTabsVisibility';
	static readonly LABEL = nls.localize('toggleTabs', "Toggle Tab Visibility");

	private static readonly tabsVisibleKey = 'workbench.editor.showTabs';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const visibility = this.configurationService.getValue<string>(ToggleTabsVisibilityAction.tabsVisibleKey);
		const newVisibilityValue = !visibility;

		return this.configurationService.updateValue(ToggleTabsVisibilityAction.tabsVisibleKey, newVisibilityValue);
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleTabsVisibilityAction, ToggleTabsVisibilityAction.ID, ToggleTabsVisibilityAction.LABEL, {
	primary: undefined,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_W, },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_W, }
}), 'View: Toggle Tab Visibility', viewCategory);

// --- Toggle Zen Mode

class ToggleZenMode extends Action {

	static readonly ID = 'workbench.action.toggleZenMode';
	static readonly LABEL = nls.localize('toggleZenMode', "Toggle Zen Mode");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
		this.enabled = !!this.layoutService;
	}

	async run(): Promise<void> {
		this.layoutService.toggleZenMode();
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleZenMode, ToggleZenMode.ID, ToggleZenMode.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_Z) }), 'View: Toggle Zen Mode', viewCategory);

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleZenMode.ID,
		title: nls.localize('miToggleZenMode', "Zen Mode"),
		toggled: InEditorZenModeContext
	},
	order: 2
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.exitZenMode',
	weight: KeybindingWeight.EditorContrib - 1000,
	handler(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.toggleZenMode();
	},
	when: InEditorZenModeContext,
	primary: KeyChord(KeyCode.Escape, KeyCode.Escape)
});

// --- Toggle Menu Bar

export class ToggleMenuBarAction extends Action {

	static readonly ID = 'workbench.action.toggleMenuBar';
	static readonly LABEL = nls.localize('toggleMenuBar', "Toggle Menu Bar");

	private static readonly menuBarVisibilityKey = 'window.menuBarVisibility';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		let currentVisibilityValue = getMenuBarVisibility(this.configurationService, this.environmentService);
		if (typeof currentVisibilityValue !== 'string') {
			currentVisibilityValue = 'default';
		}

		let newVisibilityValue: string;
		if (currentVisibilityValue === 'visible' || currentVisibilityValue === 'default') {
			newVisibilityValue = 'toggle';
		} else if (currentVisibilityValue === 'compact') {
			newVisibilityValue = 'hidden';
		} else {
			newVisibilityValue = (isWeb && currentVisibilityValue === 'hidden') ? 'compact' : 'default';
		}

		return this.configurationService.updateValue(ToggleMenuBarAction.menuBarVisibilityKey, newVisibilityValue, ConfigurationTarget.USER);
	}
}

if (isWindows || isLinux || isWeb) {
	registry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleMenuBarAction, ToggleMenuBarAction.ID, ToggleMenuBarAction.LABEL), 'View: Toggle Menu Bar', viewCategory);
}

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: ToggleMenuBarAction.ID,
		title: nls.localize({ key: 'miShowMenuBar', comment: ['&& denotes a mnemonic'] }, "Show Menu &&Bar"),
		toggled: ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals('config.window.menuBarVisibility', 'hidden'), ContextKeyExpr.notEquals('config.window.menuBarVisibility', 'toggle'))
	},
	when: IsMacNativeContext.toNegated(),
	order: 0
});

// --- Reset View Positions

export class ResetViewLocationsAction extends Action {
	static readonly ID = 'workbench.action.resetViewLocations';
	static readonly LABEL = nls.localize('resetViewLocations', "Reset View Locations");

	constructor(
		id: string,
		label: string,
		@IViewDescriptorService private viewDescriptorService: IViewDescriptorService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		viewContainerRegistry.all.forEach(viewContainer => {
			const viewDescriptors = this.viewDescriptorService.getViewDescriptors(viewContainer);

			viewDescriptors.allViewDescriptors.forEach(viewDescriptor => {
				const defaultContainer = this.viewDescriptorService.getDefaultContainer(viewDescriptor.id);
				const currentContainer = this.viewDescriptorService.getViewContainer(viewDescriptor.id);

				if (defaultContainer && currentContainer !== defaultContainer) {
					this.viewDescriptorService.moveViewsToContainer([viewDescriptor], defaultContainer);
				}
			});
		});
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(ResetViewLocationsAction, ResetViewLocationsAction.ID, ResetViewLocationsAction.LABEL), 'View: Reset View Locations', viewCategory);

// --- Move View with Command
export class MoveFocusedViewAction extends Action {
	static readonly ID = 'workbench.action.moveFocusedView';
	static readonly LABEL = nls.localize('moveFocusedView', "Move Focused View");

	constructor(
		id: string,
		label: string,
		@IViewDescriptorService private viewDescriptorService: IViewDescriptorService,
		@IViewsService private viewsService: IViewsService,
		@IQuickInputService private quickInputService: IQuickInputService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@INotificationService private notificationService: INotificationService,
		@IActivityBarService private activityBarService: IActivityBarService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

		const focusedViewId = FocusedViewContext.getValue(this.contextKeyService);

		if (focusedViewId === undefined || focusedViewId.trim() === '') {
			this.notificationService.error(nls.localize('moveFocusedView.error.noFocusedView', "There is no view currently focused."));
			return;
		}

		const viewDescriptor = this.viewDescriptorService.getViewDescriptor(focusedViewId);
		if (!viewDescriptor || !viewDescriptor.canMoveView) {
			this.notificationService.error(nls.localize('moveFocusedView.error.nonMovableView', "The currently focused view is not movable."));
			return;
		}

		const quickPick = this.quickInputService.createQuickPick();
		quickPick.placeholder = nls.localize('moveFocusedView.selectDestination', "Select a Destination for the View");

		const pinnedViewlets = this.activityBarService.getPinnedViewletIds();
		const items: Array<IQuickPickItem | IQuickPickSeparator> = this.viewletService.getViewlets()
			.filter(viewlet => {
				if (viewlet.id === this.viewDescriptorService.getViewContainer(focusedViewId)!.id) {
					return false;
				}

				return !viewContainerRegistry.get(viewlet.id)!.rejectAddedViews && pinnedViewlets.indexOf(viewlet.id) !== -1;
			})
			.map(viewlet => {
				return {
					id: viewlet.id,
					label: viewlet.name,
				};
			});

		if (this.viewDescriptorService.getViewLocation(focusedViewId) !== ViewContainerLocation.Panel) {
			items.unshift({
				type: 'separator',
				label: nls.localize('sidebar', "Side Bar")
			});
			items.push({
				type: 'separator',
				label: nls.localize('panel', "Panel")
			});
			items.push({
				id: '_.panel.newcontainer',
				label: nls.localize('moveFocusedView.newContainerInPanel', "New Container in Panel"),
			});
		}

		quickPick.items = items;

		quickPick.onDidAccept(() => {
			const destination = quickPick.selectedItems[0];

			if (destination.id === '_.panel.newcontainer') {
				this.viewDescriptorService.moveViewToLocation(viewDescriptor!, ViewContainerLocation.Panel);
				this.viewsService.openView(focusedViewId, true);
			} else if (destination.id) {
				this.viewDescriptorService.moveViewsToContainer([viewDescriptor], viewContainerRegistry.get(destination.id)!);
				this.viewsService.openView(focusedViewId, true);
			}

			quickPick.hide();
		});

		quickPick.show();
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(MoveFocusedViewAction, MoveFocusedViewAction.ID, MoveFocusedViewAction.LABEL), 'View: Move Focused View', viewCategory, FocusedViewContext.notEqualsTo(''));


// --- Resize View

export abstract class BaseResizeViewAction extends Action {

	protected static readonly RESIZE_INCREMENT = 6.5; // This is a media-size percentage

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService protected layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	protected resizePart(sizeChange: number): void {
		const isEditorFocus = this.layoutService.hasFocus(Parts.EDITOR_PART);
		const isSidebarFocus = this.layoutService.hasFocus(Parts.SIDEBAR_PART);
		const isPanelFocus = this.layoutService.hasFocus(Parts.PANEL_PART);

		let part: Parts | undefined;
		if (isSidebarFocus) {
			part = Parts.SIDEBAR_PART;
		} else if (isPanelFocus) {
			part = Parts.PANEL_PART;
		} else if (isEditorFocus) {
			part = Parts.EDITOR_PART;
		}

		if (part) {
			this.layoutService.resizePart(part, sizeChange);
		}
	}
}

export class IncreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.increaseViewSize';
	static readonly LABEL = nls.localize('increaseViewSize', "Increase Current View Size");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
	) {
		super(id, label, layoutService);
	}

	run(): Promise<boolean> {
		this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
	}
}

export class DecreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.decreaseViewSize';
	static readonly LABEL = nls.localize('decreaseViewSize', "Decrease Current View Size");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService

	) {
		super(id, label, layoutService);
	}

	run(): Promise<boolean> {
		this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
	}
}

registry.registerWorkbenchAction(SyncActionDescriptor.create(IncreaseViewSizeAction, IncreaseViewSizeAction.ID, IncreaseViewSizeAction.LABEL, undefined), 'View: Increase Current View Size', viewCategory);
registry.registerWorkbenchAction(SyncActionDescriptor.create(DecreaseViewSizeAction, DecreaseViewSizeAction.ID, DecreaseViewSizeAction.LABEL, undefined), 'View: Decrease Current View Size', viewCategory);
