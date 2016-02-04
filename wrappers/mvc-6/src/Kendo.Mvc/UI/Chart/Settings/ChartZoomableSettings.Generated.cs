using Kendo.Mvc.Extensions;
using Microsoft.AspNet.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Kendo.Mvc.UI
{
    /// <summary>
    /// Kendo UI ChartZoomableSettings class
    /// </summary>
    public partial class ChartZoomableSettings 
    {
        public ChartZoomableMousewheelSettings Mousewheel { get; } = new ChartZoomableMousewheelSettings();

        public ChartZoomableSelectionSettings Selection { get; } = new ChartZoomableSelectionSettings();

        public bool Enabled { get; set; }

        public Chart Chart { get; set; }

        protected Dictionary<string, object> SerializeSettings()
        {
            var settings = new Dictionary<string, object>();

            var mousewheel = Mousewheel.Serialize();
            if (mousewheel.Any())
            {
                settings["mousewheel"] = mousewheel;
            }
            else if (Mousewheel.Enabled == true)
            {
                settings["mousewheel"] = true;
            }

            var selection = Selection.Serialize();
            if (selection.Any())
            {
                settings["selection"] = selection;
            }
            else if (Selection.Enabled == true)
            {
                settings["selection"] = true;
            }

            return settings;
        }
    }
}
