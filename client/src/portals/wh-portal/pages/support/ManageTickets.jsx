import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";

const columns = ["Subject", "Tenant", "Status", "Created", "Actions"];

export default function ManageTickets() {
  return (
    <div className="wh-page">
      <PageHeader
        title="Manage Support Tickets"
        description="Handle and resolve client issues, requests, complaints, and technical problems."
      />
      <Card>
        <div className="wh-table-wrap">
          <table className="wh-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={columns.length} className="wh-table-empty">
                  No tickets loaded yet. Connect the support tickets API to list open and resolved items.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
