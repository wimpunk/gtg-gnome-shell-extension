const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Util = imports.misc.util;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const GTGDBus = Extension.imports.gtgdbus;
const Calendar = imports.ui.calendar;

var allTasks;	// array : Contains all the tasks
var running;	// bool : GTG is running
var actors;	// array : Contains actual actors in calendar menu

// TODO : Add multiple days tasks (On other block?)
// TODO : Write script for import data from gnome-shell
// TODO : Fix hover bug
// TODO : New menu for no-dates tasks ?

const GTGCalendarMenu = new Lang.Class({
	Name: 'GTGCalendarMenu',

	_init: function(name)
	{
		// Hide existing calendar menu
		hideSystemTasksList();
		
		// Load tasks
		allTasks = new Array();
		loadTasks();
		running = false;
		actors = [];
		
		// Signals
		this.addedSignal = GTGDBus.GTGProxy.connect('TaskAdded',
			function(sender, tid) { loadTasks(); });
		this.modifiedSignal = GTGDBus.GTGProxy.connect('TaskModified',
			function(sender, tid) { loadTasks(); });
    		this.deletedTask = GTGDBus.GTGProxy.connect('TaskDeleted',
    			function(sender, tid) { loadTasks(); });
    		
    		// Watch GTG state
		GTGDBus.DBus.session.watch_name("org.gnome.GTG", false,
			function() { running=true; loadTasks(); },
			function() { running=false; loadTasks(); });
		
		
		// Vertical separator
		let calendar = getChildByName(Main.panel._dateMenu.menu.box, 'calendarArea');
		this.addSeparator(calendar);
		
		// Main box
		this.mainBox = new St.BoxLayout();
		this.mainBox.set_vertical(true);
		this.mainBox.add_style_class_name("mainBox");
		calendar.add_actor(this.mainBox, {expand: true});
		
		// Tasks box
		this.tasksBox = new St.BoxLayout();
		this.tasksBox.set_vertical(true);
		this.mainBox.add_actor(this.tasksBox, {expand: true});
		
		// Gtg button
		this.gtgButton = new PopupMenu.PopupMenuItem("Open GTG");
		this.mainBox.add(this.gtgButton.actor,
			{y_align: St.Align.END,
		        expand: true,
		        y_fill: false});
		this.gtgButton.connect('activate', this.openGTG);
		
		// New date selected
		Main.panel._dateMenu._calendar.connect('selected-date-changed', Lang.bind(this,
		function(calendar, date) {
			this.dateChanged(date);
        	}));
        	
        	// Menu opened - closed
        	Main.panel._dateMenu.menu.connect('open-state-changed', Lang.bind(this,
		function(menu, isOpen) {
			if (isOpen)
				this.dateChanged(new Date());
        	}));
        	
        	
	},
	
	addSeparator : function(calendar)
	{
		this.separator = new St.DrawingArea({style_class: 'calendar-vertical-separator',
		pseudo_class: 'highlighted' });
		this.separator.connect('repaint', Lang.bind(this, onVertSepRepaint));
		calendar.add_actor(this.separator);
	},
	
	// New date selected in the calendar
	dateChanged: function(day)
	{
		this.removeActors();
		
		this.displayTasksForDay(day);
	
		let today = new Date();
		if (this.sameDay(day,today))
		{
			let tomorrow = new Date(day.getTime() + 86400000);
			this.displayTasksForDay(tomorrow);
		}
	},
	
	// Display tasks for given day
	displayTasksForDay: function(day)
	{
		// Title
		let strTitle = "";
		let today = new Date();
		let tomorrow = new Date(today.getTime() + 86400000);
		let title;
		if (this.sameDay(day,today))
		{
			strTitle = "Today";
		}
		else if (this.sameDay(day,tomorrow))
		{
			strTitle = "Tomorrow"
		}
		else
		{
			dateFormat = "%A, %B %d";
        		strTitle = day.toLocaleFormat(dateFormat);
        	}
        	title = new PopupMenu.PopupMenuItem(strTitle, {reactive: false});
        	title.actor.set_style("padding-top : 10px");
		title.actor.add_style_class_name("dayTitle");
		this.tasksBox.add(title.actor,{y_align: St.Align.START,y_fill: false});
		actors.push(title);
		
		// Day tasks
		if (!running)
		{
			this.displayBlockedItem("GTG is closed");
		}
		else
		{
			var nbTasks = 0;
			for (i=0; i<allTasks.length; i++)
			{
				let ret = allTasks[i].startdate;
				ret = ret.split('-');
				let taskDate = new Date(ret[0],ret[1]-1,ret[2]);
				
				if (this.sameDay(day,taskDate))
				{
					nbTasks++;
					this.displayTask(allTasks[i]);
				}
			}
			if (nbTasks < 1)
				this.displayBlockedItem("Nothing Scheduled");
		}		
	},
	
	// Display a task on the menu
	displayTask: function(task)
	{
		strTask = task.title;
		let taskItem = new PopupMenu.PopupMenuItem(strTask);
		taskItem.actor.set_style("padding-left:50px;");
		taskItem.actor.add_style_class_name("task");
		
		taskItem.connect('activate', function() {
			GTGDBus.openTaskEditor(task.id);
			Main.panel._dateMenu.menu.close();
		});
		
		
		
		this.tasksBox.add(taskItem.actor,{y_align: St.Align.START,y_fill: false});
		actors.push(taskItem);
	},
	
	// Display a blocked item (non-clickable) with given string
	displayBlockedItem: function(title)
	{
		let item = new PopupMenu.PopupMenuItem(title,{reactive:false});
		item.actor.set_style("padding-left:50px");
		item.actor.add_style_class_name("task");
		this.tasksBox.add(item.actor,{y_align: St.Align.START,y_fill: false});		
		actors.push(item);
	},
	
	// Compare two days
	sameDay: function(day1,day2)
	{
		return (day1.getDate() == day2.getDate() &&
		    	day1.getMonth() == day2.getMonth() &&
		    	day1.getYear() == day2.getYear())
	},
	
	// Remove existings actors from the menu
	removeActors: function()
	{
		for (i=0; i<actors.length; i++)
		{
			this.tasksBox.remove_actor(actors[i].actor);
		}
	},
	
	// Open GTG if it's closed
	openGTG: function()
	{
		if (running)
			GTGDBus.GTGProxy.ShowTaskBrowserRemote();
		else
			Util.spawn(['gtg']);
		
		Main.panel._dateMenu.menu.close();
	},
	
	// Destroy calendar menu
	destroy: function()
	{
		this.mainBox.destroy();
		this.separator.destroy();
		GTGDBus.GTGProxy.disconnect(this.addedSignal);
		GTGDBus.GTGProxy.disconnect(this.modifiedSignal);
		GTGDBus.GTGProxy.disconnect(this.deletedTask);
		
		let planning = Main.panel._dateMenu._eventList.actor.get_parent();
		items = planning.get_parent().get_children();
		index = items.indexOf(planning);
		items[index].show()
		items[(index == 0) ? index+1 : index-1].show()
	}
});

// Get child with given parent and name
function getChildByName (a_parent, name) 
{
	return a_parent.get_children().filter(
	function(elem)
	{
		return elem.name == name
	})[0];
}

// Hide existing calendar menu
function hideSystemTasksList()
{
	let planning = Main.panel._dateMenu._eventList.actor.get_parent();
	items = planning.get_parent().get_children();
	index = items.indexOf(planning);

	items[index].hide();
	items[(index == 0) ? index+1 : index-1].hide();
}

// Repaint vertical separator
function onVertSepRepaint(area)
{
	let cr = area.get_context();
	let themeNode = area.get_theme_node();
	let [width, height] = area.get_surface_size();
	let stippleColor = themeNode.get_color('-stipple-color');
	let stippleWidth = themeNode.get_length('-stipple-width');
	let x = Math.floor(width/2) + 0.5;
	cr.moveTo(x, 0);
	cr.lineTo(x, height);
	Clutter.cairo_set_source_color(cr, stippleColor);
	cr.setDash([1, 3], 1); // Hard-code for now
	cr.setLineWidth(stippleWidth);
	cr.stroke();
}

// Load tasks in "alltasks"
function loadTasks()
{	
	// If gtg is running
	if (running)
	{
		GTGDBus.getActiveTasks(['@all'], function (tasks) {
		allTasks = new Array();
		for (var i in tasks) {
		    allTasks.push(tasks[i]);
		}
		});
	}
	else { allTasks = new Array(); }
}