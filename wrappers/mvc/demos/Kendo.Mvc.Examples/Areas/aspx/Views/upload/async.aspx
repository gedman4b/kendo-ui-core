﻿<%@ Page Title="" Language="C#" MasterPageFile="~/Areas/aspx/Views/Shared/Web.Master" Inherits="System.Web.Mvc.ViewPage<dynamic>" %>

<asp:Content ContentPlaceHolderID="HeadContent" runat="server">
</asp:Content>

<asp:Content ContentPlaceHolderID="MainContent" runat="server">
<div class="box">
    <h4>Information</h4>
    <p>
        The Upload is able to upload files out-of-band using the
        HTML5 File API with fallback for legacy browsers.
    </p>
    <p>
        You need to configure save action that will receive
        the uploaded files.
        An optional remove action is also available.
    </p>
</div>

<div class="demo-section k-content">
    <%= Html.Kendo().Upload()
        .Name("files")
        .Async(a => a
            .Save("Save", "Upload")
            .Remove("Remove", "Upload")
            .AutoUpload(true)
        )
    %>
</div>
</asp:Content>
